import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startLab } from '../scripts/local-lab.mjs';
import { notice } from '../build/packages/contracts/src/index.js';

let lab;
before(
  async () => {
    lab = await startLab();
  },
  { timeout: 90000 },
);
after(async () => {
  if (lab) await lab.stop();
});
const call = (...args) => lab.request(...args);
async function ok(status, ...args) {
  const r = await call(...args);
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
}
async function person(role) {
  const a = lab.identity(role.toLowerCase());
  await ok(200, a, 'POST', '/me', {
    role,
    displayName: role === 'TRAINER' ? 'Personal de teste' : 'Aluno de teste',
  });
  return Object.assign(a, await ok(200, a, 'GET', '/me'));
}
async function invite(t, s) {
  await ok(202, t, 'POST', '/link-requests', { studentCode: s.studentCode });
  const list = await ok(200, s, 'GET', '/link-requests');
  return list.items.find((r) => r.trainerId === t.profileId && r.status === 'PENDING').id;
}
const acceptBody = (expectedActiveLinkId = null) => ({
  expectedActiveLinkId,
  noticeVersion: notice.version,
  consent: true,
});
async function accept(s, requestId, old = null) {
  return (await ok(200, s, 'POST', '/link-requests/' + requestId + '/accept', acceptBody(old))).linkId;
}
async function connect(t, s) {
  return accept(s, await invite(t, s));
}
function slot(offsetMin, length = 30) {
  const start = new Date(Math.ceil(Date.now() / 60000) * 60000 + offsetMin * 60000);
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(+start + length * 60000).toISOString(),
    timezone: 'America/Sao_Paulo',
  };
}
const weight = () => ({ kg: 78.25, measuredAt: new Date().toISOString(), note: 'Registro sintético' });
const rows = async (sql, params = []) => (await lab.admin.query(sql, params)).rows;

test('Migrações criam 40 entidades, uma oferta Free e versão PostgreSQL real', async () => {
  const [r] = await rows(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='personalhub' AND table_name<>'_prisma_migrations'",
  );
  assert.equal(r.n, 40);
  assert.match((await rows('select version() as v'))[0].v, /PostgreSQL 18\./);
  assert.equal(
    (await rows('select count(*)::int as n from personalhub.subscription_plans where canonical_free'))[0].n,
    1,
  );
});
test('JWT exige assinatura, emissor, audiência, expiração, sub UUID e papel autenticado', async () => {
  const a = lab.identity();
  await ok(200, null, 'GET', '/health');
  await ok(401, null, 'GET', '/me');
  await ok(401, 'token-invalido', 'GET', '/me');
  for (const overrides of [
    { exp: 0 },
    { iss: 'https://outro.example.test' },
    { aud: 'service_role' },
    { role: 'service_role' },
    { is_anonymous: true },
    { sub: 'sem-uuid' },
  ])
    await ok(401, await lab.token(a, overrides), 'GET', '/me');
  const signed = await lab.token(a),
    bits = signed.split('.');
  bits[2] = (bits[2][0] === 'A' ? 'B' : 'A') + bits[2].slice(1);
  await ok(401, bits.join('.'), 'GET', '/me');
  await ok(403, a, 'GET', '/me');
});
test('Cadastro idempotente não troca papel e não vincula por e-mail', async () => {
  const a = lab.identity(),
    key = randomUUID(),
    body = { role: 'STUDENT', displayName: 'Pessoa Teste' };
  const two = await Promise.all([call(a, 'POST', '/me', body, key), call(a, 'POST', '/me', body, key)]);
  assert.deepEqual(
    two.map((r) => r.status),
    [200, 200],
  );
  assert.deepEqual(two[0].data, two[1].data);
  await ok(409, a, 'POST', '/me', { ...body, role: 'TRAINER' });
  await ok(400, a, 'POST', '/me', { ...body, admin: true });
  await ok(409, await lab.token(lab.identity(), { email: a.email }), 'POST', '/me', body);
  assert.ok((await ok(200, a, 'GET', '/me')).studentCode);
});
test('Aluno independente cria e lê peso. Terceiros e personal sem vínculo não acessam', async () => {
  const s = await person('STUDENT'),
    other = await person('STUDENT'),
    t = await person('TRAINER');
  const w = weight();
  await ok(201, s, 'POST', '/me/weights', w);
  assert.equal((await ok(200, s, 'GET', '/students/' + s.profileId + '/weights')).items[0].kg, w.kg);
  await ok(404, other, 'GET', '/students/' + s.profileId + '/weights');
  await ok(404, t, 'GET', '/students/' + s.profileId + '/weights');
  await ok(403, t, 'POST', '/me/weights', w);
  await ok(400, s, 'POST', '/me/weights', { ...w, kg: -1 });
});
test('Convite opaco, deduplicado, somente iniciado pelo personal e decidido pelo destinatário', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    other = await person('STUDENT');
  const known = await ok(202, t, 'POST', '/link-requests', { studentCode: s.studentCode });
  assert.deepEqual(await ok(202, t, 'POST', '/link-requests', { studentCode: randomUUID() }), known);
  await ok(403, s, 'POST', '/link-requests', { studentCode: other.studentCode });
  const id = await invite(t, s);
  assert.equal((await ok(200, s, 'GET', '/link-requests')).items.length, 1);
  await ok(404, other, 'POST', '/link-requests/' + id + '/accept', acceptBody());
  await ok(400, s, 'POST', '/link-requests/' + id + '/accept', { ...acceptBody(), consent: false });
  await ok(400, s, 'POST', '/link-requests/' + id + '/accept', {
    ...acceptBody(),
    noticeVersion: 'obsoleta',
  });
  await ok(200, s, 'POST', '/link-requests/' + id + '/decline', {});
  await ok(409, s, 'POST', '/link-requests/' + id + '/accept', acceptBody());
  const second = await invite(t, s);
  await ok(200, t, 'POST', '/link-requests/' + second + '/cancel', {});
  await ok(409, s, 'POST', '/link-requests/' + second + '/accept', acceptBody());
});
test('Expiração em 168h vale na fronteira e um convite novo pode ser emitido', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    id = await invite(t, s);
  const [r] = await rows(
    'select extract(epoch from expires_at-created_at)::int as seconds from personalhub.link_requests where request_id=$1',
    [id],
  );
  assert.equal(r.seconds, 168 * 3600);
  await lab.admin.query(
    "update personalhub.link_requests set created_at=statement_timestamp()-interval '168 hours',expires_at=statement_timestamp() where request_id=$1",
    [id],
  );
  await ok(410, s, 'POST', '/link-requests/' + id + '/accept', acceptBody());
  assert.equal((await ok(200, s, 'GET', '/link-requests')).items[0].status, 'EXPIRED');
  assert.notEqual(await invite(t, s), id);
});
test('Duas aceitações simultâneas confirmam um vínculo e um consentimento', async () => {
  const a = await person('TRAINER'),
    b = await person('TRAINER'),
    s = await person('STUDENT');
  const ids = [await invite(a, s), await invite(b, s)];
  const replies = await Promise.all(
    ids.map((id) => call(s, 'POST', '/link-requests/' + id + '/accept', acceptBody())),
  );
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
  const links = (await ok(200, s, 'GET', '/links')).items;
  assert.equal(links.length, 1);
  const evidence = await rows('select decision from personalhub.consent_records where link_id=$1', [
    links[0].id,
  ]);
  assert.deepEqual(evidence, [{ decision: 'GRANTED' }]);
});
test('Troca confirmada preserva histórico do aluno, corta acesso do anterior e invalida concorrentes', async () => {
  const a = await person('TRAINER'),
    b = await person('TRAINER'),
    c = await person('TRAINER'),
    s = await person('STUDENT');
  const old = await connect(a, s),
    path = '/students/' + s.profileId + '/weights';
  await ok(201, s, 'POST', '/me/weights', weight());
  await ok(200, a, 'GET', path);
  const id = await invite(b, s),
    other = await invite(c, s);
  await ok(409, s, 'POST', '/link-requests/' + id + '/accept', acceptBody());
  const next = await accept(s, id, old);
  await ok(404, a, 'GET', path);
  assert.equal((await ok(200, b, 'GET', path)).items.length, 1);
  assert.equal(
    (await ok(200, s, 'GET', '/link-requests')).items.find((x) => x.id === other).status,
    'UNAVAILABLE',
  );
  await ok(200, s, 'POST', '/links/' + next + '/revoke', {});
  await ok(404, b, 'GET', path);
  await ok(200, s, 'GET', path);
  const refs = await rows(
    'select replaced_by_link_id from personalhub.trainer_student_links where link_id=$1',
    [old],
  );
  assert.equal(refs[0].replaced_by_link_id, next);
});
test('Cota Free no aceite preserva integralmente o vínculo antigo e sua agenda', async () => {
  const a = await person('TRAINER'),
    b = await person('TRAINER'),
    s = await person('STUDENT');
  const old = await connect(a, s);
  await ok(201, a, 'POST', '/links/' + old + '/appointments', slot(180));
  for (let i = 0; i < 3; i++) await connect(b, await person('STUDENT'));
  const id = await invite(b, s);
  const failed = await ok(409, s, 'POST', '/link-requests/' + id + '/accept', acceptBody(old));
  assert.equal(failed.code, 'CAPACITY_REACHED');
  assert.equal((await ok(200, s, 'GET', '/links')).items[0].status, 'ACTIVE');
  assert.equal((await ok(200, a, 'GET', '/links/' + old + '/appointments')).items[0].status, 'SCHEDULED');
});
test('Dois alunos disputam a última vaga Free sem ultrapassar a cota', async () => {
  const t = await person('TRAINER');
  await connect(t, await person('STUDENT'));
  await connect(t, await person('STUDENT'));
  const a = await person('STUDENT'),
    b = await person('STUDENT'),
    one = await invite(t, a),
    two = await invite(t, b);
  const rr = await Promise.all([
    call(a, 'POST', '/link-requests/' + one + '/accept', acceptBody()),
    call(b, 'POST', '/link-requests/' + two + '/accept', acceptBody()),
  ]);
  assert.deepEqual(rr.map((r) => r.status).sort(), [200, 409]);
});
test('Peso usa revisões imutáveis, autoria e controle de versão inclusive na invalidação', async () => {
  const s = await person('STUDENT'),
    t = await person('TRAINER'),
    other = await person('STUDENT');
  await connect(t, s);
  const data = weight(),
    { id } = await ok(201, s, 'POST', '/me/weights', data);
  await ok(403, t, 'PATCH', '/me/weights/' + id, { ...data, expectedRevision: 1 });
  await ok(404, other, 'PATCH', '/me/weights/' + id, { ...data, expectedRevision: 1 });
  const rr = await Promise.all(
    [80, 81].map((kg) => call(s, 'PATCH', '/me/weights/' + id, { ...data, kg, expectedRevision: 1 })),
  );
  assert.deepEqual(rr.map((r) => r.status).sort(), [200, 409]);
  await ok(400, s, 'POST', '/me/weights/' + id + '/void', { expectedRevision: 2 });
  await ok(200, s, 'POST', '/me/weights/' + id + '/void', {
    expectedRevision: 2,
    reason: 'Leitura incorreta',
  });
  const hist = (await ok(200, s, 'GET', '/me/weights/' + id + '/revisions')).items.sort(
    (a, b) => a.revisionNumber - b.revisionNumber,
  );
  assert.equal(hist.length, 3);
  assert.equal(hist[0].snapshot.kg, data.kg);
  assert.equal(hist[2].previousRevisionId, hist[1].id);
  assert.equal(hist[2].snapshot.status, 'VOIDED');
  assert.equal((await ok(200, t, 'GET', '/students/' + s.profileId + '/weights')).items.length, 0);
  await assert.rejects(
    rows("update personalhub.body_weight_revisions set reason='x' where weight_revision_id=$1", [
      hist[0].id,
    ]),
    { code: '23514' },
  );
});
test('Idempotência concorrente produz um registro e um SUCCESS, parâmetros incompatíveis geram 409', async () => {
  const s = await person('STUDENT'),
    k = randomUUID(),
    w = weight();
  const rr = await Promise.all([
    call(s, 'POST', '/me/weights', w, k),
    call(s, 'POST', '/me/weights', w, k),
  ]);
  assert.deepEqual(
    rr.map((r) => r.status),
    [201, 201],
  );
  assert.deepEqual(rr[0].data, rr[1].data);
  await ok(409, s, 'POST', '/me/weights', { ...w, kg: 80 }, k);
  const [audit] = await rows(
    'select receipt,operation_signature,outcome from personalhub.audit_events where operation_key=$1',
    [k],
  );
  assert.deepEqual(Object.keys(audit.receipt).sort(), ['id', 'revision']);
  assert.equal(audit.outcome, 'SUCCESS');
  assert.equal(audit.operation_signature.length, 64);
});
test('Falha de auditoria reverte todas as mudanças do comando', async () => {
  const s = await person('STUDENT');
  await lab.admin.query('REVOKE INSERT ON personalhub.audit_events FROM personalhub_api');
  try {
    await ok(500, s, 'POST', '/me/weights', weight());
  } finally {
    await lab.admin.query('GRANT INSERT ON personalhub.audit_events TO personalhub_api');
  }
  assert.equal((await ok(200, s, 'GET', '/students/' + s.profileId + '/weights')).items.length, 0);
});
test('Agenda impede colisão simultânea e aceita sessões adjacentes', async () => {
  const t = await person('TRAINER'),
    a = await person('STUDENT'),
    b = await person('STUDENT');
  const la = await connect(t, a),
    lb = await connect(t, b),
    when = slot(240);
  const replies = await Promise.all([
    call(t, 'POST', '/links/' + la + '/appointments', when),
    call(t, 'POST', '/links/' + lb + '/appointments', when),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
  const adjacent = {
    ...when,
    startsAt: when.endsAt,
    endsAt: new Date(+new Date(when.endsAt) + 600000).toISOString(),
  };
  await ok(201, t, 'POST', '/links/' + la + '/appointments', adjacent);
  await ok(403, a, 'POST', '/links/' + la + '/appointments', slot(400));
  await ok(400, t, 'POST', '/links/' + la + '/appointments', { ...when, timezone: 'Inexistente/Fuso' });
});
test('Encerramento classifica futuro, passado e sessão em andamento no mesmo instante', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    link = await connect(t, s);
  const path = '/links/' + link + '/appointments';
  const ids = [];
  for (const n of [300, 400, 500, 600]) ids.push((await ok(201, t, 'POST', path, slot(n))).id);
  await ok(200, t, 'POST', '/appointments/' + ids[3] + '/resolve', {
    status: 'CANCELLED',
    expectedRevision: 1,
  });
  await lab.admin.query(
    "update personalhub.appointments set starts_at=now()-interval '2 hour',ends_at=now()-interval '1 hour' where appointment_id=$1",
    [ids[0]],
  );
  await lab.admin.query(
    "update personalhub.appointments set starts_at=now()-interval '10 minutes',ends_at=now()+interval '10 minutes' where appointment_id=$1",
    [ids[1]],
  );
  await ok(200, s, 'POST', '/links/' + link + '/revoke', {});
  const states = Object.fromEntries(
    (await ok(200, s, 'GET', path)).items.map((v) => [v.id, [v.status, v.statusReason]]),
  );
  assert.deepEqual(
    ids.map((id) => states[id]),
    [
      ['CLOSED_UNRESOLVED', 'LINK_ENDED_UNRESOLVED'],
      ['ARCHIVED', 'LINK_ENDED_INTERRUPTED'],
      ['ARCHIVED', 'LINK_ENDED_FUTURE'],
      ['CANCELLED', null],
    ],
  );
  const [times] = await rows(
    "select count(distinct created_at)::int as n from personalhub.appointment_events where appointment_id=any($1) and event_type='LINK_ENDED'",
    [ids],
  );
  assert.equal(times.n, 1);
  await ok(404, t, 'GET', path);
});
test('Remarcação verifica revisão, isola participantes e não reabre uma sessão terminal', async () => {
  const t = await person('TRAINER'),
    other = await person('TRAINER'),
    s = await person('STUDENT'),
    link = await connect(t, s);
  const { id } = await ok(201, t, 'POST', '/links/' + link + '/appointments', slot(850));
  await ok(404, other, 'PATCH', '/appointments/' + id, { ...slot(900), expectedRevision: 1 });
  await ok(200, t, 'PATCH', '/appointments/' + id, { ...slot(900), expectedRevision: 1 });
  await ok(409, t, 'POST', '/appointments/' + id + '/resolve', {
    status: 'COMPLETED',
    expectedRevision: 2,
  });
  await ok(200, t, 'POST', '/appointments/' + id + '/resolve', {
    status: 'CANCELLED',
    expectedRevision: 2,
  });
  await ok(409, t, 'PATCH', '/appointments/' + id, { ...slot(990), expectedRevision: 3 });
});
test('Suspensão de conta bloqueia nova requisição e impede consulta pelo personal', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT');
  await connect(t, s);
  await lab.admin.query("update personalhub.users set account_status='SUSPENDED' where user_id=$1", [s.id]);
  await ok(403, s, 'GET', '/me');
  await ok(404, t, 'GET', '/students/' + s.profileId + '/weights');
});
test('Paginação por cursor mantém isolamento; respostas privadas pedem no-store', async () => {
  const s = await person('STUDENT'),
    w = weight();
  for (let i = 0; i < 3; i++) await ok(201, s, 'POST', '/me/weights', { ...w, kg: 80 + i });
  const base = '/students/' + s.profileId + '/weights?limit=2',
    first = await ok(200, s, 'GET', base),
    second = await ok(200, s, 'GET', base + '&after=' + first.next);
  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map((w) => w.id)).size, 3);
  assert.equal(second.next, null);
  const res = await fetch(lab.apiUrl + '/me', {
    headers: { Authorization: 'Bearer ' + (await lab.token(s)) },
  });
  assert.match(res.headers.get('cache-control'), /no-store/);
});
test('Credencial do runtime não possui DELETE, gestão de ofertas ou leitura dos módulos fechados', async () => {
  const [grants] = await rows(
    "select has_table_privilege('personalhub_api','personalhub.users','DELETE') as del, has_table_privilege('personalhub_api','personalhub.plan_entitlements','UPDATE') as edit, has_table_privilege('personalhub_api','personalhub.meals','SELECT') as meals",
  );
  assert.deepEqual(grants, { del: false, edit: false, meals: false });
});
async function exercise(t, name = 'Remada') {
  return (await ok(201, t, 'POST', '/exercises', { name, exerciseType: 'STRENGTH' })).id;
}
function program(exerciseId, title = 'Ficha A') {
  return { title, exercises: [{ exerciseId, sets: [{ reps: 10, loadKg: 12.5 }, { reps: 8 }] }] };
}
async function publish(t, link, content) {
  const draft = await ok(201, t, 'POST', '/links/' + link + '/plans', content);
  const version = await ok(201, t, 'POST', '/plans/' + draft.id + '/publish', { expectedRevision: 1 });
  return { planId: draft.id, versionId: version.id };
}
test('Catálogo privado e rascunho invisível ao aluno. Publicação cria snapshot imutável', async () => {
  const a = await person('TRAINER'),
    b = await person('TRAINER'),
    s = await person('STUDENT'),
    link = await connect(a, s);
  const owned = await exercise(a),
    other = await exercise(b);
  await ok(409, a, 'POST', '/links/' + link + '/plans', program(other));
  assert.equal((await ok(200, b, 'GET', '/exercises')).items.length, 1);
  const { id } = await ok(201, a, 'POST', '/links/' + link + '/plans', program(owned));
  assert.equal((await ok(200, s, 'GET', '/students/' + s.profileId + '/workouts')).items.length, 0);
  await ok(403, s, 'GET', '/links/' + link + '/drafts');
  const results = await Promise.all(
    [1, 2].map(() => call(a, 'POST', '/plans/' + id + '/publish', { expectedRevision: 1 })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const ver = results.find((r) => r.status === 201).data.id;
  await ok(200, a, 'PUT', '/plans/' + id + '/draft', {
    expectedRevision: 2,
    content: program(owned, 'Ficha B'),
  });
  const second = await ok(201, a, 'POST', '/plans/' + id + '/publish', { expectedRevision: 3 });
  assert.equal(second.version, 2);
  const first = await ok(200, s, 'GET', '/workout-versions/' + ver);
  assert.equal(first.snapshot.title, 'Ficha A');
  assert.equal(first.snapshot.exercises[0].name, 'Remada');
  assert.equal(first.snapshot.exercises[0].sets.length, 2);
  await assert.rejects(
    rows("update personalhub.workout_plan_versions set title='mudança' where plan_version_id=$1", [ver]),
    { code: '23514' },
  );
});
test('Aluno executa a ficha antiga após troca e sucessor só lê sua publicação', async () => {
  const a = await person('TRAINER'),
    b = await person('TRAINER'),
    s = await person('STUDENT'),
    stranger = await person('STUDENT'),
    link = await connect(a, s);
  const { planId, versionId } = await publish(a, link, program(await exercise(a)));
  await accept(s, await invite(b, s), link);
  await ok(404, a, 'GET', '/workout-versions/' + versionId);
  await ok(200, b, 'GET', '/workout-versions/' + versionId);
  await ok(404, b, 'PUT', '/plans/' + planId + '/draft', {
    expectedRevision: 2,
    content: program(await exercise(b)),
  });
  await ok(404, stranger, 'POST', '/workout-versions/' + versionId + '/executions', {});
  const { id } = await ok(201, s, 'POST', '/workout-versions/' + versionId + '/executions', {});
  const data = await ok(200, s, 'GET', '/executions/' + id),
    sets = data.exercises[0].sets;
  const actual = [
    { prescribedSetId: sets[0].prescribedSetId, status: 'COMPLETED', reps: 9, loadKg: 12.5 },
    { prescribedSetId: sets[1].prescribedSetId, status: 'SKIPPED' },
  ];
  await ok(200, s, 'POST', '/executions/' + id + '/finish', {
    expectedRevision: 1,
    outcome: 'COMPLETED',
    sets: actual,
  });
  assert.equal((await ok(200, b, 'GET', '/executions/' + id)).exercises[0].status, 'PARTIAL');
  await ok(404, a, 'GET', '/executions/' + id);
  const corrected = [{ ...actual[0], reps: 10 }, actual[1]];
  await ok(200, s, 'POST', '/executions/' + id + '/corrections', {
    expectedRevision: 2,
    sets: corrected,
    reason: 'Conferência da série',
  });
  const revs = await rows(
    'select revision_number,snapshot from personalhub.workout_revisions where execution_id=$1 order by revision_number',
    [id],
  );
  assert.deepEqual(
    revs.map((r) => r.snapshot.exercises[0].sets[0].actualReps),
    [9, 10],
  );
  assert.equal(revs[0].snapshot.prescription.title, 'Ficha A');
});
test('Execução rejeita série alheia, duplicada e omitida, e aceita abandono explícito', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    link = await connect(t, s);
  const { versionId } = await publish(t, link, program(await exercise(t)));
  const { id } = await ok(201, s, 'POST', '/workout-versions/' + versionId + '/executions', {}),
    url = '/executions/' + id + '/finish';
  const e = await ok(200, s, 'GET', '/executions/' + id);
  const actual = { prescribedSetId: e.exercises[0].sets[0].prescribedSetId, reps: 8, status: 'COMPLETED' };
  for (const bad of [[{ ...actual, prescribedSetId: randomUUID() }], [actual, actual], [actual]])
    await ok(409, s, 'POST', url, { expectedRevision: 1, outcome: 'COMPLETED', sets: bad });
  await ok(200, s, 'POST', url, { expectedRevision: 1, outcome: 'ABANDONED', sets: [actual] });
  assert.equal((await ok(200, s, 'GET', '/executions/' + id)).status, 'ABANDONED');
  await ok(409, s, 'POST', url, { expectedRevision: 2, outcome: 'COMPLETED', sets: [actual] });
});
test('Vínculo revogado impede publicar rascunho existente e mantém a prescrição do aluno', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    link = await connect(t, s);
  const { versionId, planId } = await publish(t, link, program(await exercise(t)));
  await ok(200, s, 'POST', '/links/' + link + '/revoke', {});
  await ok(404, t, 'POST', '/plans/' + planId + '/publish', { expectedRevision: 2 });
  await ok(201, s, 'POST', '/workout-versions/' + versionId + '/executions', {});
});
test('PAST_DUE aplica a capacidade Free na confirmação e mantém o histórico autorizado dos excedentes', async () => {
  const t = await person('TRAINER');
  const [p] = await rows(
    "insert into personalhub.subscription_plans(offer_code,version,code,billing_period,status,price_cents,effective_from) values('TEST_PRO',1,'PRO','MONTHLY','ACTIVE',4000,now()) returning subscription_plan_id as id",
  );
  await rows(
    "insert into personalhub.plan_entitlements(plan_id,feature_code,value_type,integer_value) values($1,'ACTIVE_STUDENTS','INTEGER',8)",
    [p.id],
  );
  await rows('update personalhub.subscriptions set plan_id=$1 where trainer_id=$2 and is_current', [
    p.id,
    t.profileId,
  ]);
  const existing = [];
  for (let i = 0; i < 4; i++) {
    const s = await person('STUDENT');
    await connect(t, s);
    existing.push(s);
  }
  await rows("update personalhub.subscriptions set status='PAST_DUE' where trainer_id=$1 and is_current", [
    t.profileId,
  ]);
  const s = await person('STUDENT'),
    req = await invite(t, s);
  await ok(409, s, 'POST', '/link-requests/' + req + '/accept', acceptBody());
  assert.equal((await ok(200, t, 'GET', '/links')).items.filter((x) => x.status === 'ACTIVE').length, 4);
  await ok(200, t, 'GET', '/students/' + existing[3].profileId + '/weights');
});
test('Limite de convites inclui códigos desconhecidos sem expor contas', async () => {
  const t = await person('TRAINER');
  for (let i = 0; i < 20; i++) await ok(202, t, 'POST', '/link-requests', { studentCode: randomUUID() });
  await ok(429, t, 'POST', '/link-requests', { studentCode: randomUUID() });
});
test('O banco rejeita aceite sem vínculo e recusa quebra da cadeia de revisões', async () => {
  const t = await person('TRAINER'),
    s = await person('STUDENT'),
    request = await invite(t, s);
  await assert.rejects(
    rows("update personalhub.link_requests set status='ACCEPTED', resolved_at=now() where request_id=$1", [
      request,
    ]),
    { code: '23514' },
  );
  const { id } = await ok(201, s, 'POST', '/me/weights', weight());
  const [first] = await rows(
    'select weight_revision_id as id from personalhub.body_weight_revisions where record_id=$1',
    [id],
  );
  await assert.rejects(
    rows(
      "insert into personalhub.body_weight_revisions(record_id,revision_number,previous_revision_id,snapshot,actor_user_id) values($1,3,$2,'{}',$3)",
      [id, first.id, s.id],
    ),
    { code: '23514' },
  );
});
