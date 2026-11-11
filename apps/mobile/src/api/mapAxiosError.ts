import type { ApiErrorBody } from './types';
import { apiErrorSchema } from './types';

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
