export function getFriendlyProfileError(error: unknown): string {
  const fromBody = extractApiError(error);
  const code = fromBody.code?.toUpperCase() ?? '';
  const message = fromBody.message ?? '';
  const raw = message || stringifyUnknown(error);
  const lower = raw.toLowerCase();

  if (code === 'PHONE_TAKEN' || lower.includes('phone_taken')) {
    return 'Ese teléfono ya está en uso por otra cuenta. Probá con otro número.';
  }
  if (code === 'PHONE_TOO_LONG' || lower.includes('phone_too_long')) {
    return 'El teléfono es demasiado largo. Usá hasta 20 caracteres.';
  }
  if (code === 'VALIDATION_ERROR' || code === 'BAD_REQUEST') {
    return message || 'Revisá los datos del perfil e intentá de nuevo.';
  }
  if (
    code === 'UNAUTHORIZED' ||
    (typeof (error as { response?: { status?: number } })?.response?.status === 'number' &&
      (error as { response: { status: number } }).response.status === 401)
  ) {
    return 'Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.';
  }
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch') ||
    (error as { code?: string })?.code === 'ERR_NETWORK'
  ) {
    return 'Sin conexión. Revisá tu internet e intentá de nuevo.';
  }
  if (message.trim()) return message.trim();
  return 'No se pudo guardar el perfil. Intentá de nuevo.';
}

function extractApiError(error: unknown): { code?: string; message?: string } {
  if (error == null || typeof error !== 'object') return {};
  const e = error as {
    message?: unknown;
    response?: { data?: { error?: { code?: unknown; message?: unknown } | string } };
    error?: { code?: unknown; message?: unknown };
  };
  const bodyErr = e.response?.data?.error;
  if (bodyErr && typeof bodyErr === 'object') {
    return {
      code: bodyErr.code != null ? String(bodyErr.code) : undefined,
      message: bodyErr.message != null ? String(bodyErr.message) : undefined,
    };
  }
  if (typeof bodyErr === 'string') return { message: bodyErr };
  if (e.error && typeof e.error === 'object') {
    return {
      code: e.error.code != null ? String(e.error.code) : undefined,
      message: e.error.message != null ? String(e.error.message) : undefined,
    };
  }
  if (typeof e.message === 'string') return { message: e.message };
  return {};
}

function stringifyUnknown(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}
