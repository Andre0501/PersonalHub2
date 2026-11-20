import { createClient } from '@supabase/supabase-js';
export type DemoAccount = { label: string; email: string; password: string };
declare global {
  interface Window {
    __PERSONALHUB__?: { supabaseUrl: string; publicKey: string; apiUrl: string; accounts?: DemoAccount[] };
  }
}
const config = window.__PERSONALHUB__;
const url = config?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
const key = config?.publicKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const base = config?.apiUrl ?? import.meta.env.VITE_API_URL ?? '/v1';
export const auth =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          detectSessionInUrl: false,
          autoRefreshToken: true,
        },
      }).auth
    : null;
export const demos = config?.accounts ?? [];
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Me = {
  id: string;
  role: 'STUDENT' | 'TRAINER';
  displayName: string;
  profileId: string;
  studentCode?: string;
};
export type Link = {
  id: string;
  studentId: string;
  counterpart: string | null;
  status: string;
  endReason?: string;
};
export type Invite = { id: string; counterpart: string; status: string; expiresAt: string };
export type WeightRow = {
  id: string;
  kg: number;
  measuredAt: string;
  status: string;
  revisionNumber: number;
  note?: string | null;
};
export type Appointment = { id: string; startsAt: string; endsAt: string; status: string };
const pending = new Map<string, string>();
export function clearCommands() {
  pending.clear();
}
export async function api<T>(token: string, path: string, method = 'GET', body?: object): Promise<T> {
  const command = JSON.stringify([method, path, body]);
  const id = pending.get(command) ?? crypto.randomUUID();
  if (method !== 'GET') pending.set(command, id);
  const res = await fetch(base.replace(/\/$/, '') + path, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'GET' ? {} : { 'Idempotency-Key': id }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (res.ok || res.status < 500) pending.delete(command);
  if (!res.ok) throw new ApiError(data.code ?? 'HTTP_' + res.status, data.message ?? 'A operação falhou.');
  return data;
}
export async function all<T>(token: string, path: string): Promise<T[]> {
  const result: T[] = [];
  let next: string | null = null;
  do {
    const suffix: string = '?limit=100' + (next ? '&after=' + encodeURIComponent(next) : '');
    const batch: { items: T[]; next: string | null } = await api(token, path + suffix);
    result.push(...batch.items);
    next = batch.next;
  } while (next);
  return result;
}
