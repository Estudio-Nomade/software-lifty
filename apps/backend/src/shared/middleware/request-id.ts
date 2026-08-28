import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

let requestCount = 0;

function isNoisy(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/favicon.ico' ||
    pathname === '/health' ||
    pathname === '/ready' ||
    pathname === '/metrics' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/')
  );
}

export const requestId = new Elysia({ name: 'request-id' })
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    if (isNoisy(url.pathname)) return;
    logger.debug('→', request.method, url.pathname);
  })
  .derive({ as: 'scoped' }, ({ request, set }) => {
    const id = request.headers.get('x-request-id') || crypto.randomUUID();
    set.headers['X-Request-ID'] = id;

    const num = ++requestCount;
    const start = Date.now();

    return {
      requestId: id,
      log: logger.scoped({ requestId: id }),
      _metrics: { num, start },
    };
  })
  .onAfterHandle({ as: 'scoped' }, ({ request, set, _metrics, log }) => {
    const duration = Date.now() - (_metrics as { start: number }).start;
    const url = new URL(request.url);
    const status = Number(set.status ?? 200);
    const method = request.method;

    if (isNoisy(url.pathname)) return;

    if (status >= 400) {
      log.warn(method, url.pathname, status, `${duration}ms`);
    } else {
      log.info(method, url.pathname, status, `${duration}ms`);
    }
  })
  .onError({ as: 'scoped' }, ({ request, set, _metrics, error, code, log }) => {
    const duration = Date.now() - ((_metrics as { start: number })?.start ?? Date.now());
    const url = new URL(request.url);

    if (isNoisy(url.pathname)) return;

    // Elysia leaves set.status empty on route miss until the root onError
    // assigns 404 — map known codes so logs never show "NOT_FOUND … 200".
    const status =
      code === 'NOT_FOUND'
        ? 404
        : code === 'VALIDATION'
          ? 400
          : typeof set.status === 'number'
            ? set.status
            : 500;

    const l = log ?? logger;
    l.error(
      code ?? 'UNKNOWN',
      request.method,
      url.pathname,
      status,
      `${duration}ms`,
      (error as Error)?.message ?? 'Unknown error',
    );
  });
