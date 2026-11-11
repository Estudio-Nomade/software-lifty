import type { ApiErrorBody } from './types';
import { apiErrorSchema } from './types';

const NETWORK_MESSAGES: Record<string, string> = {
  ERR_NETWORK:
    'No pudimos hablar con el servidor de Lifty. Revisá conexión o API (en browser: red/CORS).',
  ERR_TIMEOUT: 'Tiempo de espera agotado. El servidor no responde.',
  ERR_CANCELED: 'Solicitud cancelada.',
};

/** Lifty envelope or legacy `{ error: string, code?, message? }` auth bodies. */
export function mapResponseDataToApiError(
  data: unknown,
  status: number,
  opts?: { apiUrl?: string; isDev?: boolean },
): ApiErrorBody {
  const parsed = apiErrorSchema.safeParse(data);
  if (parsed.success) return parsed.data;

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
    if (status === 401) {
      if (code === 'TOKEN_EXPIRED' || message.toLowerCase().includes('expired')) {
        message = 'Tu sesión expiró. Volvé a iniciar sesión.';
      } else if (code === 'TOKEN_REQUIRED' || message === 'Unauthorized') {
        message = 'Necesitás iniciar sesión para continuar.';
      }
    }
    const body: ApiErrorBody = {
      error: {
        code: status === 401 && code === 'INTERNAL_ERROR' ? 'TOKEN_REQUIRED' : code,
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
  let message = NETWORK_MESSAGES[code] ?? 'Sin conexion. Verifica tu internet.';
  if (opts?.isDev && code === 'ERR_NETWORK' && opts.apiUrl) {
    message = `${message} URL: ${opts.apiUrl}`;
  }
  return {
    error: {
      code: 'NETWORK_ERROR',
      message,
      status: 0,
    },
    meta: { timestamp: new Date().toISOString() },
  };
}
