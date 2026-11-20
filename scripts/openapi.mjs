import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import * as inputs from '../build/packages/contracts/src/index.js';
const str = { type: 'string' },
  id = { ...str, format: 'uuid' },
  date = { ...str, format: 'date-time' },
  integer = { type: 'integer' },
  num = { type: 'number' },
  bool = { type: 'boolean' };
const nullable = (s) => ({ anyOf: [s, { type: 'null' }] });
const obj = (properties, optional = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
});
const dict = { type: 'object', additionalProperties: true };
const array = (items) => ({ type: 'array', items });
const list = (item) => obj({ items: array(item), next: nullable(id) });
const named = (...values) => ({ type: 'string', enum: values });
const idReceipt = obj({ id }),
  editReceipt = obj({ id, revision: integer }),
  statusReceipt = obj({ id, status: str }),
  stateReceipt = obj({ id, revision: integer, status: str });
const entryStatus = named('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE');
const err = obj({ code: str, message: str });
const paths = {},
  op = (method, path, tag, summary, body, returns, result = 200, options = {}) => {
    const parameters = [];
    if (path.includes('{id}')) parameters.push({ name: 'id', in: 'path', required: true, schema: id });
    if (method !== 'get')
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: id,
        description: 'UUID por intenção. Uma repetição confirmada devolve o recibo original.',
      });
    if (options.paged)
      parameters.push(
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 30, minimum: 1, maximum: 100 } },
        { name: 'after', in: 'query', schema: id },
      );
    const content = (schema) => ({ 'application/json': { schema } });
    const response = { description: 'Operação confirmada', content: content(returns) };
    if (options.paged) response.description = 'Página em ordem crescente de UUID. next alimenta after.';
    const responses = { [result]: response };
    for (const [code, description] of Object.entries({
      400: 'Entrada inválida',
      401: 'Sessão ausente ou inválida',
      403: 'Perfil ou estado incompatível',
      404: 'Recurso indisponível para este ator',
      409: 'Estado, autoria, revisão, cota ou chave incompatível',
      410: 'Convite expirado',
      429: 'Limite de convites',
      500: 'Falha interna',
      503: 'Dependência indisponível',
    })) {
      if (options.public && !['500', '503'].includes(code)) continue;
      if (code === '410' && !/accept|decline|cancel/.test(path)) continue;
      if (code === '429' && !(path === '/link-requests' && method === 'post')) continue;
      if (code === '409' && method === 'get') continue;
      responses[code] = { description, content: content(err) };
    }
    const operationId =
      method +
      '_' +
      path
        .replace(/[{}]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    const o = {
      tags: [tag],
      summary,
      operationId,
      parameters,
      responses,
      ...(options.public ? { security: [] } : {}),
    };
    if (body) {
      const schema = z.toJSONSchema(body, { io: 'input', unrepresentable: 'any' });
      delete schema.$schema;
      o.requestBody = { required: body !== inputs.noFields, content: content(schema) };
    }
    (paths[path] ??= {})[method] = o;
  };
const paged = { paged: true };
op(
  'get',
  '/health',
  'Operação',
  'Verificar conectividade com o banco',
  null,
  obj({ status: { const: 'ok' } }),
  200,
  { public: true },
);
op(
  'get',
  '/me',
  'Identidade',
  'Consultar o próprio perfil',
  null,
  obj({ id, role: named('TRAINER', 'STUDENT'), displayName: str, profileId: id, studentCode: id }, [
    'studentCode',
  ]),
);
op('post', '/me', 'Identidade', 'Concluir cadastro com o papel escolhido', inputs.registration, idReceipt);
op(
  'get',
  '/consent-notice',
  'Vínculos',
  'Ler a finalidade e a versão do aviso',
  null,
  obj({ version: str, scope: str, purpose: str, text: str }),
);
op(
  'post',
  '/link-requests',
  'Vínculos',
  'Enviar convite por código de compartilhamento',
  inputs.invitation,
  obj({ received: { const: true } }),
  202,
);
op(
  'get',
  '/link-requests',
  'Vínculos',
  'Listar apenas as próprias solicitações',
  null,
  list(
    obj({
      id,
      trainerId: id,
      studentId: id,
      counterpart: str,
      status: entryStatus,
      createdAt: date,
      expiresAt: date,
    }),
  ),
  200,
  paged,
);
op(
  'post',
  '/link-requests/{id}/accept',
  'Vínculos',
  'Aceitar ou trocar o vínculo atual de forma explícita',
  inputs.acceptance,
  obj({ linkId: id }),
);
for (const [action, name] of [
  ['decline', 'Recusar convite recebido'],
  ['cancel', 'Cancelar convite enviado'],
])
  op('post', '/link-requests/{id}/' + action, 'Vínculos', name, inputs.noFields, statusReceipt);
op(
  'get',
  '/links',
  'Vínculos',
  'Consultar vínculos próprios e histórico de encerramentos',
  null,
  list(
    obj({
      id,
      trainerId: id,
      studentId: id,
      counterpart: nullable(str),
      status: named('ACTIVE', 'ENDED'),
      startedAt: date,
      endedAt: nullable(date),
      endReason: nullable(str),
    }),
  ),
  200,
  paged,
);
for (const [action, name] of [
  ['end', 'Encerrar como participante'],
  ['revoke', 'Revogar consentimento como aluno'],
])
  op(
    'post',
    '/links/{id}/' + action,
    'Vínculos',
    name,
    inputs.noFields,
    obj({ linkId: id, status: { const: 'ENDED' } }),
  );
op(
  'post',
  '/me/weights',
  'Evolução',
  'Registrar peso e primeira revisão',
  inputs.weightEntry,
  editReceipt,
  201,
);
op(
  'get',
  '/students/{id}/weights',
  'Evolução',
  'Consultar as medições permitidas',
  null,
  list(
    obj({
      id,
      kg: num,
      measuredAt: date,
      note: nullable(str),
      status: named('ACTIVE', 'VOIDED'),
      revisionNumber: integer,
    }),
  ),
  200,
  paged,
);
op(
  'patch',
  '/me/weights/{id}',
  'Evolução',
  'Corrigir e versionar o próprio registro',
  inputs.weightCorrection,
  editReceipt,
);
op(
  'post',
  '/me/weights/{id}/void',
  'Evolução',
  'Invalidar um peso com justificativa',
  inputs.invalidation,
  editReceipt,
);
op(
  'get',
  '/me/weights/{id}/revisions',
  'Evolução',
  'Consultar revisões do próprio registro',
  null,
  list(
    obj({
      id,
      revisionNumber: integer,
      previousRevisionId: nullable(id),
      snapshot: obj({ kg: num, note: nullable(str), status: str, measuredAt: date }),
      reason: nullable(str),
      createdAt: date,
    }),
  ),
  200,
  paged,
);
op(
  'post',
  '/links/{id}/appointments',
  'Agenda',
  'Agendar sessão no vínculo ativo',
  inputs.booking,
  editReceipt,
  201,
);
op(
  'get',
  '/links/{id}/appointments',
  'Agenda',
  'Ler agenda do vínculo',
  null,
  list(
    obj({
      id,
      startsAt: date,
      endsAt: date,
      timezone: str,
      status: str,
      statusReason: nullable(str),
      recordRevision: integer,
    }),
  ),
  200,
  paged,
);
op('patch', '/appointments/{id}', 'Agenda', 'Remarcar sessão agendada', inputs.bookingChange, stateReceipt);
op(
  'post',
  '/appointments/{id}/resolve',
  'Agenda',
  'Confirmar desfecho da sessão',
  inputs.bookingDecision,
  stateReceipt,
);
op(
  'post',
  '/exercises',
  'Treinos',
  'Cadastrar um exercício no próprio catálogo',
  inputs.exerciseInput,
  idReceipt,
  201,
);
op(
  'get',
  '/exercises',
  'Treinos',
  'Consultar o próprio catálogo',
  null,
  list(obj({ id, name: str, description: nullable(str), exerciseType: str })),
  200,
  paged,
);
op(
  'post',
  '/links/{id}/plans',
  'Treinos',
  'Criar ficha e primeiro rascunho',
  inputs.planContent,
  editReceipt,
  201,
);
op(
  'get',
  '/links/{id}/drafts',
  'Treinos',
  'Consultar rascunhos privados do autor',
  null,
  list(obj({ id, planId: id, draftContent: dict, draftRevision: integer, baseVersionId: nullable(id) })),
  200,
  paged,
);
op(
  'put',
  '/plans/{id}/draft',
  'Treinos',
  'Substituir rascunho com controle de revisão',
  inputs.draftEdit,
  editReceipt,
);
op(
  'post',
  '/plans/{id}/publish',
  'Treinos',
  'Publicar snapshot completo e imutável',
  inputs.revisionCheck,
  obj({ id, version: integer, draftRevision: integer }),
  201,
);
op(
  'get',
  '/students/{id}/workouts',
  'Treinos',
  'Listar versões publicadas do aluno',
  null,
  list(obj({ id, planId: id, versionNumber: integer, title: str, publishedAt: date })),
  200,
  paged,
);
const prescribedSet = obj(
  { id, position: integer, reps: integer, loadKg: num, seconds: integer, meters: num },
  ['reps', 'loadKg', 'seconds', 'meters'],
);
const prescribedEx = obj({
  id,
  sourceExerciseId: id,
  name: str,
  description: nullable(str),
  exerciseType: str,
  instructions: nullable(str),
  position: integer,
  sets: array(prescribedSet),
});
op(
  'get',
  '/workout-versions/{id}',
  'Treinos',
  'Consultar prescrição completa em versão fixa',
  null,
  obj({
    id,
    planId: id,
    versionNumber: integer,
    snapshot: obj({ title: str, instructions: nullable(str), exercises: array(prescribedEx) }),
  }),
);
op(
  'post',
  '/workout-versions/{id}/executions',
  'Treinos',
  'Iniciar uma execução para o titular da ficha',
  inputs.noFields,
  editReceipt,
  201,
);
op(
  'get',
  '/students/{id}/executions',
  'Treinos',
  'Listar execuções do aluno',
  null,
  list(
    obj({
      id,
      planVersionId: id,
      status: str,
      startedAt: date,
      finishedAt: nullable(date),
      executionRevision: integer,
    }),
  ),
  200,
  paged,
);
const actual = obj({
  prescribedSetId: id,
  position: integer,
  targetReps: nullable(integer),
  targetLoadKg: nullable(str),
  targetSeconds: nullable(integer),
  targetMeters: nullable(str),
  status: str,
  reps: nullable(integer),
  loadKg: nullable(str),
  seconds: nullable(integer),
  meters: nullable(str),
});
op(
  'get',
  '/executions/{id}',
  'Treinos',
  'Consultar prescrição e desempenho série a série',
  null,
  obj({
    id,
    status: str,
    executionRevision: integer,
    planVersionId: id,
    startedAt: date,
    finishedAt: nullable(date),
    exercises: array(obj({ name: str, prescribedExerciseId: id, status: str, sets: array(actual) })),
  }),
);
op(
  'post',
  '/executions/{id}/finish',
  'Treinos',
  'Finalizar ou abandonar e gravar a revisão inicial',
  inputs.executionFinish,
  stateReceipt,
);
op(
  'post',
  '/executions/{id}/corrections',
  'Treinos',
  'Corrigir uma execução concluída deixando evidência',
  inputs.executionCorrection,
  stateReceipt,
);
const doc = {
  openapi: '3.1.0',
  info: {
    title: 'PersonalHub',
    version: '0.1.0',
    description:
      'Operações publicadas na API de desenvolvimento. O código de negócio e as restrições SQL complementam as regras condicionais das entradas.',
  },
  servers: [{ url: '/v1' }],
  security: [{ SupabaseJWT: [] }],
  components: { securitySchemes: { SupabaseJWT: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths,
};
await writeFile(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
