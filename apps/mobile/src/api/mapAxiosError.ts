import type { ApiErrorBody } from './types';
import { ApiError, apiErrorSchema } from './types';

const NETWORK_MESSAGES: Record<string, string> = {
  ERR_NETWORK:
    'No pudimos hablar con el servidor de Lifty. Revisá conexión o API (en browser: red/CORS).',
  ERR_TIMEOUT: 'Tiempo de espera agotado. El servidor no responde.',
  /** Axios often uses this code for request timeouts. */
  ECONNABORTED: 'Tiempo de espera agotado. El servidor no responde.',
  ERR_CANCELED: 'Solicitud cancelada.',
};

function sessionMessageFor401(code: string, rawMessage: string): { code: string; message: string } {
  const lower = rawMessage.toLowerCase();
  if (code === 'TOKEN_EXPIRED' || lower.includes('expired')) {
    return { code: 'TOKEN_EXPIRED', message: 'Tu sesión expiró. Volvé a iniciar sesión.' };
  }
  if (code === 'TOKEN_REQUIRED' || rawMessage === 'Unauthorized' || !rawMessage) {
    return {
      code: 'TOKEN_REQUIRED',
      message: 'Necesitás iniciar sesión para continuar.',
    };
  }
  return {
    code: code === 'INTERNAL_ERROR' ? 'TOKEN_REQUIRED' : code,
    message: rawMessage || 'Necesitás iniciar sesión para continuar.',
  };
}

/** Lifty envelope or legacy `{ error: string, code?, message? }` auth bodies. */
export function mapResponseDataToApiError(
  data: unknown,
  status: number,
  opts?: { apiUrl?: string; isDev?: boolean },
): ApiErrorBody {
  const parsed = apiErrorSchema.safeParse(data);
  if (parsed.success) {
    // Prefer Spanish session copy even when envelope already matches schema
    // (backend TOKEN_EXPIRED still uses English message).
    if (status === 401 || parsed.data.error.status === 401) {
      const fixed = sessionMessageFor401(parsed.data.error.code, parsed.data.error.message);
      return {
        ...parsed.data,
        error: {
          ...parsed.data.error,
          code: fixed.code,
          message: fixed.message,
          status: 401,
        },
      };
    }
    return parsed.data;
  }

  if (data && typeof data === 'object') {
    const raw = data as Record<string, unknown>;
    const code =
      typeof raw.code === 'string'
        ? raw.code
        : typeof (raw.error as { code?: unknown } | undefined)?.code === 'string'
          ? (raw.error as { code: string }).code
          : 'INTERNAL_ERROR';
    const messageFromError =
      typeof raw.error === 'string'
        ? raw.error
        : typeof (raw.error as { message?: unknown } | undefined)?.message === 'string'
          ? (raw.error as { message: string }).message
          : null;
    let message =
      (typeof raw.message === 'string' && raw.message) ||
      messageFromError ||
      (status === 401
        ? 'Se requiere iniciar sesión.'
        : status === 0
          ? NETWORK_MESSAGES.ERR_NETWORK
          : 'Error inesperado del servidor.');
    let outCode = code;
    if (status === 401) {
      const fixed = sessionMessageFor401(code, message);
      outCode = fixed.code;
      message = fixed.message;
    }
    const body: ApiErrorBody = {
      error: {
        code: status === 401 && outCode === 'INTERNAL_ERROR' ? 'TOKEN_REQUIRED' : outCode,
        message,
        status,
      },
      meta: { timestamp: new Date().toISOString() },
    };
    if (opts?.isDev && status === 0 && opts.apiUrl) {
      body.error.message = `${body.error.message} URL: ${opts.apiUrl}`;
    }
    return body;
  }

  // Non-object body (null, string, empty): never claim "server" on auth/network.
  if (status === 401) {
    const fixed = sessionMessageFor401('TOKEN_REQUIRED', typeof data === 'string' ? data : '');
    return {
      error: { code: fixed.code, message: fixed.message, status: 401 },
      meta: { timestamp: new Date().toISOString() },
    };
  }
  if (status === 0) {
    let message = NETWORK_MESSAGES.ERR_NETWORK;
    if (opts?.isDev && opts.apiUrl) {
      message = `${message} URL: ${opts.apiUrl}`;
    }
    return {
      error: { code: 'NETWORK_ERROR', message, status: 0 },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error inesperado del servidor.',
      status,
    },
    meta: { timestamp: new Date().toISOString() },
  };
}

export function mapNetworkCodeToApiError(
  code: string,
  opts?: { apiUrl?: string; isDev?: boolean },
): ApiErrorBody {
  const normalized =
    code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_TIMEOUT'
      ? 'ERR_TIMEOUT'
      : code;
  let message =
    NETWORK_MESSAGES[code] ?? NETWORK_MESSAGES[normalized] ?? 'Sin conexion. Verifica tu internet.';
  if (opts?.isDev && opts.apiUrl && (normalized === 'ERR_NETWORK' || code === 'ERR_NETWORK')) {
    message = `${message} URL: ${opts.apiUrl}`;
  }
  return {
    error: {
      code: normalized === 'ERR_TIMEOUT' ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
      message,
      status: 0,
    },
    meta: { timestamp: new Date().toISOString() },
  };
}

/**
 * Auth refresh failed in a way that means the session is dead (not transport).
 */
export function isAuthRefreshFailure(failure: unknown): boolean {
  if (failure == null) return true;
  if (typeof failure !== 'object') {
    const text = String(failure).toLowerCase();
    return /session|refresh|jwt|token|expired|unauthorized|invalid/i.test(text);
  }
  const err = failure as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
    statusCode?: unknown;
  };
  const status = Number(err.status ?? err.statusCode);
  if (status === 401 || status === 403) return true;
  if (status === 0 || status >= 500) return false;
  const code = String(err.code ?? '');
  if (
    code === 'ERR_NETWORK' ||
    code === 'ERR_TIMEOUT' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'NETWORK_ERROR' ||
    code === 'TIMEOUT_ERROR'
  ) {
    return false;
  }
  const msg = String(err.message ?? '').toLowerCase();
  if (/network|fetch failed|failed to fetch|timeout|econnaborted|offline|socket/i.test(msg)) {
    return false;
  }
  // Default: Supabase AuthError / missing refresh token → session dead.
  return true;
}

type RefreshMapOpts = { apiUrl?: string; isDev?: boolean };

/**
 * Single mapped reject after refreshSession fails.
 * Auth death → session ApiError from the original 401; transport → network/timeout (no fake 401).
 */
export function rejectErrorAfterRefreshFailure(
  refreshFailure: unknown,
  original: { response?: { data?: unknown; status?: number } | null },
  opts?: RefreshMapOpts,
): ApiError {
  const sessionExpired = new ApiError(
    mapResponseDataToApiError(
      original.response?.data ?? { error: 'Unauthorized', code: 'TOKEN_EXPIRED' },
      original.response?.status ?? 401,
      opts,
    ),
  );

  if (isAuthRefreshFailure(refreshFailure)) {
    return sessionExpired;
  }

  if (refreshFailure instanceof ApiError) {
    return refreshFailure;
  }

  const code =
    refreshFailure && typeof refreshFailure === 'object' && 'code' in refreshFailure
      ? String((refreshFailure as { code?: unknown }).code ?? '')
      : '';
  if (
    code === 'ERR_NETWORK' ||
    code === 'ERR_TIMEOUT' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_CANCELED'
  ) {
    return new ApiError(mapNetworkCodeToApiError(code, opts));
  }

  const msg =
    refreshFailure instanceof Error
      ? refreshFailure.message
      : refreshFailure && typeof refreshFailure === 'object' && 'message' in refreshFailure
        ? String((refreshFailure as { message?: unknown }).message ?? '')
        : '';
  if (/timeout|aborted/i.test(msg)) {
    return new ApiError(mapNetworkCodeToApiError('ERR_TIMEOUT', opts));
  }
  return new ApiError(mapNetworkCodeToApiError('ERR_NETWORK', opts));
}

const OPAQUE_SERVER_RE = /inesperado del servidor|internal server error/i;

/**
 * UI-safe message from ApiError / unknown throws.
 * Never surfaces INTERNAL_ERROR / «Error inesperado del servidor» / bare Unauthorized.
 */
export function userFacingApiMessage(
  err: unknown,
  opts?: {
    fallback?: string;
    /** Defaults copy when opaque server / missing message. */
    context?: 'location' | 'save' | 'generic';
  },
): string {
  const fallback =
    opts?.fallback ??
    (opts?.context === 'location'
      ? 'No pudimos completar la ubicación. Revisá el GPS o elegí una sugerencia de la lista.'
      : opts?.context === 'save'
        ? 'No pudimos guardar los datos. Revisá la conexión e intentá de nuevo.'
        : 'Algo salió mal. Intentá de nuevo.');

  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : Number.NaN;
  const raw =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : typeof err === 'string'
          ? err
          : '';

  if (
    code === 'TOKEN_EXPIRED' ||
    (status === 401 && /expir/i.test(raw)) ||
    /sesión expiró|sesion expiro/i.test(raw)
  ) {
    return 'Tu sesión expiró. Volvé a iniciar sesión.';
  }
  if (
    code === 'TOKEN_REQUIRED' ||
    status === 401 ||
    raw === 'Unauthorized' ||
    /iniciar sesión|iniciar sesion/i.test(raw)
  ) {
    // Prefer existing Spanish session copy when already mapped.
    if (raw && !OPAQUE_SERVER_RE.test(raw) && raw !== 'Unauthorized') {
      return raw;
    }
    return 'Necesitás iniciar sesión para continuar.';
  }
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT_ERROR' || status === 0) {
    return raw && !OPAQUE_SERVER_RE.test(raw)
      ? raw
      : 'No pudimos hablar con el servidor. Revisá tu conexión.';
  }
  if (code === 'INTERNAL_ERROR' || OPAQUE_SERVER_RE.test(raw)) {
    return fallback;
  }
  if (raw.trim()) return raw;
  return fallback;
}
