import { Elysia } from 'elysia';

export const securityHeaders = new Elysia({ name: 'security-headers' }).onAfterHandle(
  { as: 'scoped' },
  ({ set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    if (process.env.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
  },
);

// Private IPv4 ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x, etc.) — used by
// devices on the local network to open the dev server via LAN IP. In dev we
// treat them as trusted so the browser CORS preflight doesn't block the API.
const PRIVATE_IP_ORIGIN =
  /^https?:\/\/(?:(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const isLocalDevOrigin = (origin: string) =>
  process.env.NODE_ENV !== 'production' &&
  (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || PRIVATE_IP_ORIGIN.test(origin));

export const cors = new Elysia({ name: 'cors' }).onRequest(({ request, set }) => {
  const origin = request.headers.get('origin') || '*';
  const allowed = process.env.CORS_ORIGIN || '*';

  if (
    allowed === '*' ||
    allowed === origin ||
    allowed
      .split(',')
      .map((o) => o.trim())
      .includes(origin) ||
    isLocalDevOrigin(origin)
  ) {
    set.headers['Access-Control-Allow-Origin'] = origin;
  }
  set.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
  set.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
  set.headers['Access-Control-Max-Age'] = '86400';

  if (request.method === 'OPTIONS') {
    set.status = 204;
    return new Response(null, { status: 204, headers: set.headers as unknown as HeadersInit });
  }
});
