import { timingSafeEqual } from 'node:crypto';

/** Extract bridge secret from Authorization Bearer or X-Transit-Bridge-Secret. */
export function extractBridgeSecret(
  headers: Headers | Record<string, string | undefined>,
): string | null {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower) return v;
    }
    return undefined;
  };

  const custom = get('x-transit-bridge-secret');
  if (custom?.trim()) return custom.trim();

  const auth = get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // still run compare on equal-length buffers to reduce timing leaks on length
    const dummy = Buffer.alloc(a.length);
    timingSafeEqual(a, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function validateTransitBridgeAuth(
  headers: Headers | Record<string, string | undefined>,
): { ok: true } | { ok: false; status: 401 | 503; code: string; message: string } {
  const expected = process.env.TRANSIT_BRIDGE_SECRET;
  if (!expected || !expected.trim()) {
    return {
      ok: false,
      status: 503,
      code: 'BRIDGE_NOT_CONFIGURED',
      message: 'Transit bridge secret not configured',
    };
  }

  const provided = extractBridgeSecret(headers);
  if (!provided || !secretsEqual(provided, expected.trim())) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing transit bridge secret',
    };
  }

  return { ok: true };
}
