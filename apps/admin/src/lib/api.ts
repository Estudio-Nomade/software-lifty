import { supabase } from './supabase';

const DEFAULT_API = 'http://127.0.0.1:3001';

export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL || DEFAULT_API).replace(/\/$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new ApiError(401, 'TOKEN_REQUIRED', 'Sesión requerida');
  }

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errObj =
      body && typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error: { code?: string; message?: string } | string }).error
        : null;
    const code =
      typeof errObj === 'object' && errObj?.code
        ? errObj.code
        : res.status === 403
          ? 'FORBIDDEN'
          : 'ERROR';
    const message =
      typeof errObj === 'object' && errObj?.message
        ? errObj.message
        : typeof errObj === 'string'
          ? errObj
          : `Error ${res.status}`;
    throw new ApiError(res.status, code, message);
  }

  return body as T;
}
