/**
 * Detect dead API hosts (Railway "Application not found", network down)
 * so UI can show honest "server down" copy instead of "couldn't calculate fare".
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function messageFromBody(data: unknown): string {
  const rec = asRecord(data);
  if (!rec) return '';
  if (typeof rec.message === 'string') return rec.message;
  const err = asRecord(rec.error);
  if (err && typeof err.message === 'string') return err.message;
  return '';
}

/** True when the failure is the API host/network, not a business maps error. */
export function isApiUnreachable(err: unknown): boolean {
  const ax = asRecord(err);
  if (!ax) return false;

  const code = typeof ax.code === 'string' ? ax.code : '';
  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  ) {
    return true;
  }

  if (!ax.response) {
    // Axios network error: no HTTP response at all
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/network|timeout|econnrefused|failed to fetch/i.test(msg)) return true;
  }

  const response = asRecord(ax.response);
  if (!response) return false;
  const status = typeof response.status === 'number' ? response.status : 0;
  const bodyMsg = messageFromBody(response.data);

  if (status === 404 && /application not found/i.test(bodyMsg)) return true;
  // Railway edge sometimes 404s all paths with the same platform body
  if (status === 502 || status === 503 || status === 504) return true;

  return false;
}

export const API_DOWN_TITLE = 'El servidor Lifty no responde';
export const API_DOWN_MESSAGE =
  'La API no está disponible (red o servidor caído). En lab usá el backend local (:3001) con health 200. Probá más tarde.';

export const FARE_FAIL_TITLE = 'No pudimos calcular la tarifa';
export const FARE_FAIL_MESSAGE = 'Reintentá más tarde.';

export const ROUTE_FAIL_TITLE = 'No pudimos trazar la ruta';
export const ROUTE_FAIL_MESSAGE =
  'La tarifa puede mostrarse igual; la línea del mapa no está disponible.';
