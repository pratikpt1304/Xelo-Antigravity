import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) {
    throw new Error(res.error.message);
  }
  if (res.data === null) {
    throw new Error('empty_response');
  }
  return res.data;
}

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const res = await supabase.rpc(name, args);
  if (res.error) {
    throw new Error(res.error.message);
  }
  return res.data as T;
}

export async function fn<T>(name: string, body?: unknown): Promise<T> {
  const res = await supabase.functions.invoke<T>(name, {
    body: body === undefined ? {} : (body as Record<string, unknown>),
  });
  if (res.error) {
    throw new Error(res.error.message);
  }
  if (res.data === null) {
    throw new Error('empty_response');
  }
  return res.data;
}
