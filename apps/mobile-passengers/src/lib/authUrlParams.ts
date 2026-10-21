/** Decode percent-encoding without throwing on malformed sequences. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Apply `a=b&c=d` pairs; split only on first `=` so values may contain `=` / encoded `&`. */
function applyQuerySegment(segment: string, params: Record<string, string>): void {
  if (!segment) return;
  for (const pair of segment.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    if (!rawKey) continue;
    params[safeDecode(rawKey)] = safeDecode(rawVal);
  }
}

/** Parse OAuth redirect URL query/hash without Expo deps (unit-testable). */
export function getAuthQueryParams(url: string): {
  params: Record<string, string>;
  errorCode: string | null;
} {
  const params: Record<string, string> = {};
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  if (q >= 0) {
    applyQuerySegment(h > q ? url.slice(q + 1, h) : url.slice(q + 1), params);
  }
  if (h >= 0) {
    applyQuerySegment(url.slice(h + 1), params);
  }

  return { params, errorCode: params.error ?? null };
}

/** True only for this app's OAuth callback deep link (not password-reset / other `code=` routes). */
export function isAuthCallbackUrl(url: string, scheme: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const schemeLower = scheme.toLowerCase();
  if (!lower.startsWith(`${schemeLower}:`)) return false;

  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:/i, '');
  const pathPart = withoutScheme.replace(/^\/\//, '').split(/[?#]/)[0] ?? '';
  const segments = pathPart.split('/').filter(Boolean);
  return segments[0] === 'auth-callback' || segments.includes('auth-callback');
}

export function hasOAuthCallbackPayload(url: string): boolean {
  return url.includes('code=') || url.includes('access_token') || url.includes('error=');
}
