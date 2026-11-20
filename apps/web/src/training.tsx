import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { all, api } from './client';
import type { Link, Me } from './client';
type Exercise = { id: string; name: string };
type Draft = {
  id: string;
  planId: string;
  draftRevision: number;
  draftContent: { title: string };
  baseVersionId: string | null;
};
type Version = { id: string; title: string; versionNumber: number };
type SessionRow = { id: string; planVersionId: string; status: string; executionRevision: number };
type Details = {
  id: string;
  executionRevision: number;
  exercises: {
    name: string;
    prescribedExerciseId: string;
    sets: {
      prescribedSetId: string;
      position: number;
      targetReps: number | null;
      targetLoadKg: string | null;
    }[];
  }[];
};
export function TrainingConsole({ token, me, link }: { token: string; me: Me; link?: Link }) {
  const isStudent = me.role === 'STUDENT',
    studentId = isStudent ? me.profileId : link?.studentId;
  const [catalog, setCatalog] = useState<Exercise[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [versions, setVersions] = useState<Version[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]),
    [detail, setDetail] = useState<Details | null>(null);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  async function load() {
    const seq = ++epoch.current;
    try {
      const [es, ds, vs, ss] = await Promise.all([
        !isStudent ? all<Exercise>(token, '/exercises') : [],
        !isStudent && link?.status === 'ACTIVE' ? all<Draft>(token, '/links/' + link.id + '/drafts') : [],
        studentId ? all<Version>(token, '/students/' + studentId + '/workouts') : [],
        studentId ? all<SessionRow>(token, '/students/' + studentId + '/executions') : [],
      ]);
      if (seq !== epoch.current) return;
      setCatalog(es);
      setDrafts(ds);
      setVersions(vs);
      setSessions(ss);
      setDetail(null);
    } catch (e) {
      if (seq !== epoch.current) return;
      setCatalog([]);
      setDrafts([]);
      setVersions([]);
      setSessions([]);
      setDetail(null);
      setMessage(e instanceof Error ? e.message : 'Consulta indisponível.');
    }
  }
  useEffect(() => {
    void load();
    const visibility = () => {
      if (document.hidden) {
        epoch.current++;
        setDetail(null);
        setVersions([]);
        setSessions([]);
        setDrafts([]);
      } else void load();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      epoch.current++;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [token, link?.id, studentId]);
  async function command(path: string, body: object, text: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api(token, path, 'POST', body);
      await load();
      setMessage(text);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  async function openSession(id: string) {
    const seq = epoch.current;
    try {
      const d = await api<Details>(token, '/executions/' + id);
      if (seq === epoch.current) setDetail(d);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Execução indisponível.');
    }
  }
  function finish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    const f = new FormData(e.currentTarget);
    const sets = detail.exercises.flatMap((x) =>
      x.sets.map((s) => {
        const id = s.prescribedSetId,
          r = String(f.get('rep' + id) || ''),
          kg = String(f.get('kg' + id) || '');
        if (f.get('skip' + id)) return { prescribedSetId: id, status: 'SKIPPED' };
        return {
          prescribedSetId: id,
          status: 'COMPLETED',
          ...(r ? { reps: Number(r) } : {}),
          ...(kg ? { loadKg: Number(kg) } : {}),
        };
      }),
    );
    void command(
      '/executions/' + detail.id + '/finish',
      { expectedRevision: detail.executionRevision, outcome: 'COMPLETED', sets },
      'Treino registrado.',
    );
  }
  return (
    <section>
      <h2>Treinos</h2>
      {!isStudent && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command(
                '/exercises',
                { name: String(f.get('exercise')), exerciseType: 'STRENGTH' },
                'Exercício cadastrado.',
              );
            }}
          >
            <label>
              Nome do exercício
              <input name="exercise" minLength={2} maxLength={100} required />
            </label>
            <button disabled={busy}>Cadastrar exercício</button>
          </form>
          {link?.status === 'ACTIVE' && catalog.length > 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void command(
                  '/links/' + link.id + '/plans',
                  {
                    title: String(f.get('title')),
                    exercises: [
                      {
                        exerciseId: f.get('exercise'),
                        sets: Array.from({ length: Number(f.get('sets')) }, () => ({
                          reps: Number(f.get('reps')),
                        })),
                      },
                    ],
                  },
                  'Rascunho criado.',
                );
              }}
            >
              <label>
                Título da ficha
                <input name="title" minLength={2} maxLength={100} required />
              </label>
              <label>
                Exercício do catálogo
                <select name="exercise">
                  {catalog.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Séries prescritas
                <input name="sets" type="number" min="1" max="12" step="1" required defaultValue={2} />
              </label>
              <label>
                Repetições por série
                <input name="reps" type="number" min="1" max="10000" step="1" required defaultValue={10} />
              </label>
              <button disabled={busy}>Criar rascunho</button>
            </form>
          )}
          {drafts
            .filter((d) => !d.baseVersionId)
            .map((d) => (
              <p key={d.id}>
                {d.draftContent.title} · rascunho{' '}
                <button
                  disabled={busy}
                  onClick={() =>
                    void command(
                      '/plans/' + d.planId + '/publish',
                      { expectedRevision: d.draftRevision },
                      'Ficha publicada.',
                    )
                  }
                >
                  Publicar ficha
                </button>
              </p>
            ))}
        </>
      )}
      {versions.map((v) => (
        <p key={v.id}>
          {v.title} · versão {v.versionNumber}{' '}
          {isStudent && (
            <button
              disabled={busy}
              onClick={() =>
                void command('/workout-versions/' + v.id + '/executions', {}, 'Treino iniciado.')
              }
            >
              Iniciar treino
            </button>
          )}
        </p>
      ))}
      {versions.length === 0 && <p>Nenhuma ficha publicada.</p>}
      {sessions.map((s) => (
        <p key={s.id}>
          {versions.find((v) => v.id === s.planVersionId)?.title ?? 'Treino'} ·{' '}
          {s.status === 'IN_PROGRESS'
            ? 'Em andamento'
            : s.status === 'ABANDONED'
              ? 'Abandonado'
              : 'Concluído'}{' '}
          {isStudent && s.status === 'IN_PROGRESS' && (
            <button onClick={() => void openSession(s.id)}>Registrar séries</button>
          )}
        </p>
      ))}
      {detail && (
        <form onSubmit={finish}>
          {detail.exercises.map((x) => (
            <fieldset key={x.prescribedExerciseId}>
              <legend>{x.name}</legend>
              {x.sets.map((s) => (
                <fieldset key={s.prescribedSetId}>
                  <legend>
                    Série {s.position}
                    {s.targetReps ? ' · ' + s.targetReps + ' repetições prescritas' : ''}
                  </legend>
                  <label>
                    Repetições realizadas
                    <input name={'rep' + s.prescribedSetId} type="number" min="1" step="1" />
                  </label>
                  <label>
                    Carga realizada em kg
                    <input name={'kg' + s.prescribedSetId} type="number" min="0" step="0.001" />
                  </label>
                  <label>
                    <input type="checkbox" name={'skip' + s.prescribedSetId} /> Série pulada
                  </label>
                </fieldset>
              ))}
            </fieldset>
          ))}
          <button disabled={busy}>Concluir treino</button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
