import { supabase } from './supabase.js';

const BASE = import.meta.env['VITE_API_URL'] as string ?? 'http://localhost:3001';

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    // Token expired or invalid — sign out
    await supabase.auth.signOut();
    throw new Error('Session expired — please log in again');
  }

  const json = await res.json() as { success: boolean; data?: T; error?: string };
  if (!json.success) throw new Error(json.error ?? 'API error');
  return json.data as T;
};

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
