import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { notice } from '../../../packages/contracts/src/notice';
import { all, api, ApiError, auth, clearCommands, demos } from './client';
import type { Appointment, Invite, Link, Me, WeightRow } from './client';
import { TrainingConsole } from './training';
import './technical.css';
const date = (s: string) => new Date(s).toLocaleString('pt-BR');
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
const labels: Record<string, string> = {
  ACTIVE: 'Ativo',
  ENDED: 'Encerrado',
  SCHEDULED: 'Agendada',
  CANCELLED: 'Cancelada',
  ARCHIVED: 'Arquivada',
  CLOSED_UNRESOLVED: 'Encerrada sem desfecho',
  COMPLETED: 'Concluída',
  NO_SHOW: 'Ausência registrada',
  VOIDED: 'Invalidado',
};
const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
function AuthScreen() {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function sign(email: string, password: string, create = false) {
    if (!auth) return;
    setBusy(true);
    setMessage('');
    try {
      const result = create
        ? await auth.signUp({ email, password })
        : await auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (create && !result.data.session)
        setMessage('Confira o e-mail de confirmação e depois entre na sua conta.');
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Entrar</h2>
      {demos.length > 0 && (
        <section>
          <h3>Contas fictícias desta demonstração</h3>
          {demos.map((d) => (
            <button key={d.email} disabled={busy} onClick={() => void sign(d.email, d.password)}>
              {d.label}
            </button>
          ))}
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          void sign(val(f, 'email'), String(f.get('password') ?? ''), b?.value === 'signup');
        }}
      >
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button disabled={busy}>Entrar com e-mail</button>
        {!demos.length && (
          <button value="signup" disabled={busy}>
            Criar conta
          </button>
        )}
      </form>
      <p role="status">{message}</p>
    </>
  );
}
function Workspace({ session }: { session: Session }) {
  const token = session.access_token;
  const [me, setMe] = useState<Me | null>(null),
    [register, setRegister] = useState(false);
  const [links, setLinks] = useState<Link[]>([]),
    [invites, setInvites] = useState<Invite[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]),
    [appointments, setAppointments] = useState<Appointment[]>([]);
  const [chosen, setChosen] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const selected = links.find((l) => l.id === chosen),
    current = links.find((l) => l.status === 'ACTIVE');
  async function refresh(selectedId = chosen) {
    const cycle = ++epoch.current;
    try {
      const user = await api<Me>(token, '/me');
      const [ls, ins] = await Promise.all([
        all<Link>(token, '/links'),
        all<Invite>(token, '/link-requests'),
      ]);
      const l =
        ls.find((x) => x.id === selectedId && (user.role === 'STUDENT' || x.status === 'ACTIVE')) ??
        ls.find((x) => x.status === 'ACTIVE');
      const target = user.role === 'STUDENT' ? user.profileId : l?.studentId;
      const [ws, as] = await Promise.all([
        target ? all<WeightRow>(token, '/students/' + target + '/weights') : [],
        l ? all<Appointment>(token, '/links/' + l.id + '/appointments') : [],
      ]);
      if (cycle !== epoch.current) return;
      setMe(user);
      setRegister(false);
      setLinks(ls);
      setInvites(ins);
      setChosen(l?.id ?? '');
      setWeights(ws.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      setAppointments(as.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    } catch (e) {
      if (cycle !== epoch.current) return;
      setWeights([]);
      setAppointments([]);
      setLinks([]);
      setInvites([]);
      setChosen('');
      if (e instanceof ApiError && e.code === 'PROFILE_REQUIRED') setRegister(true);
      else setMessage(errorText(e));
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [token]);
  useEffect(() => {
    const sync = () => {
      if (!document.hidden) void refresh();
      else {
        epoch.current++;
        setWeights([]);
        setAppointments([]);
      }
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [token, chosen]);
  async function run(path: string, body: object, text: string, method = 'POST') {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await api(token, path, method, body);
      await refresh();
      setMessage(text);
    } catch (e) {
      setMessage(errorText(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  function form(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return new FormData(e.currentTarget);
  }
  const logout = <button onClick={() => void auth?.signOut({ scope: 'local' })}>Sair</button>;
  if (register)
    return (
      <>
        <h2>Completar cadastro</h2>
        <form
          onSubmit={(e) => {
            const f = form(e);
            void run('/me', { displayName: val(f, 'name'), role: val(f, 'role') }, 'Perfil criado.');
          }}
        >
          <label>
            Nome de exibição
            <input name="name" minLength={2} maxLength={80} required />
          </label>
          <label>
            Perfil
            <select name="role">
              <option value="STUDENT">Aluno</option>
              <option value="TRAINER">Personal</option>
            </select>
          </label>
          <button disabled={busy}>Salvar perfil</button>
        </form>
        {logout}
        <p role="status">{message}</p>
      </>
    );
  if (!me)
    return (
      <>
        <p role="status">{message || 'Carregando perfil…'}</p>
        {logout}
      </>
    );
  const isStudent = me.role === 'STUDENT';
  return (
    <>
      <header>
        <h2>{me.displayName}</h2>
        <p>{isStudent ? 'Aluno' : 'Personal trainer'}</p>
        {logout}
        <button disabled={busy} onClick={() => void refresh()}>
          Atualizar dados
        </button>
      </header>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section>
        <h2>Vínculos</h2>
        {isStudent ? (
          <p>
            Seu código para receber convites <code>{me.studentCode}</code>
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              const f = form(e);
              void run('/link-requests', { studentCode: val(f, 'code') }, 'Solicitação recebida.');
            }}
          >
            <label>
              Código do aluno
              <input name="code" required />
            </label>
            <button disabled={busy}>Enviar convite</button>
          </form>
        )}
        {invites
          .filter((r) => r.status === 'PENDING')
          .map((r) => (
            <form
              key={r.id + (current?.id ?? '')}
              onSubmit={(e) => {
                form(e);
                void run(
                  '/link-requests/' + r.id + '/accept',
                  {
                    consent: true,
                    noticeVersion: notice.version,
                    expectedActiveLinkId: current?.id ?? null,
                  },
                  'Vínculo ativo.',
                );
              }}
            >
              <h3>
                Convite {isStudent ? 'de' : 'para'} {r.counterpart}
              </h3>
              <p>Válido até {date(r.expiresAt)}</p>
              {isStudent && (
                <>
                  <p>{notice.text}</p>
                  <label>
                    <input type="checkbox" required /> Li e autorizo o compartilhamento com {r.counterpart}.
                  </label>
                  {current && (
                    <label>
                      <input type="checkbox" required /> Confirmo a troca de {current.counterpart} para{' '}
                      {r.counterpart}.
                    </label>
                  )}
                  <button disabled={busy}>Aceitar convite</button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    '/link-requests/' + r.id + (isStudent ? '/decline' : '/cancel'),
                    {},
                    isStudent ? 'Convite recusado.' : 'Convite cancelado.',
                  )
                }
              >
                {isStudent ? 'Recusar' : 'Cancelar convite'}
              </button>
            </form>
          ))}
        {links.length === 0 && <p>Nenhum vínculo confirmado.</p>}
        {links.map((l) => (
          <p key={l.id}>
            {l.counterpart ?? 'Vínculo anterior'} · {labels[l.status] ?? l.status}{' '}
            {(isStudent || l.status === 'ACTIVE') && (
              <button
                onClick={() => {
                  setWeights([]);
                  setAppointments([]);
                  void refresh(l.id);
                }}
              >
                Consultar
              </button>
            )}
            {l.status === 'ACTIVE' && (
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Encerrar o vínculo e retirar o acesso do personal?'))
                    void run('/links/' + l.id + (isStudent ? '/revoke' : '/end'), {}, 'Vínculo encerrado.');
                }}
              >
                {isStudent ? 'Revogar acesso' : 'Encerrar vínculo'}
              </button>
            )}
          </p>
        ))}
      </section>
      {(isStudent || selected?.status === 'ACTIVE') && (
        <section>
          <h2>{isStudent ? 'Meu peso' : 'Peso de ' + selected?.counterpart}</h2>
          {isStudent && (
            <form
              onSubmit={(e) => {
                const f = form(e);
                void run(
                  '/me/weights',
                  { kg: Number(f.get('kg')), measuredAt: new Date(val(f, 'at')).toISOString() },
                  'Peso registrado.',
                );
              }}
            >
              <label>
                Peso em kg
                <input name="kg" type="number" step="0.01" min="0.01" max="9999.99" required />
              </label>
              <label>
                Data e hora da medição
                <input type="datetime-local" name="at" required />
              </label>
              <button disabled={busy}>Registrar peso</button>
            </form>
          )}
          {weights.length ? (
            <ul>
              {weights.map((w) => (
                <li key={w.id}>
                  {w.kg.toLocaleString('pt-BR')} kg · {date(w.measuredAt)} · {labels[w.status]} · revisão{' '}
                  {w.revisionNumber}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma medição disponível.</p>
          )}
        </section>
      )}
      <TrainingConsole key={selected?.id ?? me.id} token={token} me={me} link={selected} />
      {selected && (
        <section>
          <h2>Agenda com {selected.counterpart}</h2>
          {!isStudent && selected.status === 'ACTIVE' && (
            <form
              onSubmit={(e) => {
                const f = form(e);
                void run(
                  '/links/' + selected.id + '/appointments',
                  {
                    startsAt: new Date(val(f, 'start')).toISOString(),
                    endsAt: new Date(val(f, 'end')).toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                  'Sessão agendada.',
                );
              }}
            >
              <label>
                Início
                <input type="datetime-local" name="start" required />
              </label>
              <label>
                Fim
                <input type="datetime-local" name="end" required />
              </label>
              <button disabled={busy}>Agendar sessão</button>
            </form>
          )}
          {appointments.length ? (
            <ul>
              {appointments.map((a) => (
                <li key={a.id}>
                  {date(a.startsAt)} – {date(a.endsAt)} · {labels[a.status] ?? a.status}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma sessão agendada.</p>
          )}
        </section>
      )}
    </>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!auth) return;
    const { data } = auth.onAuthStateChange((_event, s) => {
      if (!s) clearCommands();
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main>
      <h1>PersonalHub</h1>
      {!auth ? (
        <p>Configure o acesso ao Supabase ou inicie a demonstração pelo comando do projeto.</p>
      ) : session ? (
        <Workspace key={session.user.id} session={session} />
      ) : (
        <AuthScreen />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  void navigator.serviceWorker.register('/sw.js').catch(() => {});
