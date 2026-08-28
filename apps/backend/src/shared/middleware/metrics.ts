import { Elysia } from 'elysia';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../lib/metrics';

export const metricsMiddleware = new Elysia({ name: 'metrics' })
  .derive({ as: 'scoped' }, () => {
    return { _metricsStart: performance.now() };
  })
  .onAfterHandle({ as: 'scoped' }, ({ request, set, _metricsStart }) => {
    const duration = (performance.now() - _metricsStart) / 1000;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const status = String(set.status || 200);

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, duration);
  })
  .onError({ as: 'scoped' }, ({ request, set, _metricsStart, code }) => {
    const duration = (_metricsStart ? performance.now() - _metricsStart : 0) / 1000;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    // Route misses leave set.status empty until root onError; map codes first.
    const status = String(
      code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : set.status || 500,
    );

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, duration);
  });
