import { Elysia } from 'elysia';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import { collectBody, createTripBody, startTripBody, tripIdParams } from './schema';
import { tripService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

const acceptRateLimit = rateLimit({
  name: 'rate-limit-trip-accept',
  keyPrefix: 'ratelimit:trip:accept:ip',
  max: Number(process.env.TRIP_ACCEPT_RATE_LIMIT_MAX) || 5,
  windowMs: Number(process.env.TRIP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

const cancelRateLimit = rateLimit({
  name: 'rate-limit-trip-cancel',
  keyPrefix: 'ratelimit:trip:cancel:ip',
  max: Number(process.env.TRIP_CANCEL_RATE_LIMIT_MAX) || 5,
  windowMs: Number(process.env.TRIP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

const completeRateLimit = rateLimit({
  name: 'rate-limit-trip-complete',
  keyPrefix: 'ratelimit:trip:complete:ip',
  max: Number(process.env.TRIP_COMPLETE_RATE_LIMIT_MAX) || 3,
  windowMs: Number(process.env.TRIP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

const startRateLimit = rateLimit({
  name: 'rate-limit-trip-start',
  keyPrefix: 'ratelimit:trip:start:ip',
  max: Number(process.env.TRIP_START_RATE_LIMIT_MAX) || 10,
  windowMs: Number(process.env.TRIP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

const startRoute = new Elysia()
  .use(startRateLimit)
  .post(
    '/:id/start',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.startTrip(user, params.id, body.verification_code), set),
    { params: tripIdParams, body: startTripBody, requireAuth: true },
  );

const acceptRoute = new Elysia()
  .use(acceptRateLimit)
  .post(
    '/:id/accept',
    ({ user, params, set }) => safeCall(() => tripService.acceptTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  );

const cancelRoute = new Elysia()
  .use(cancelRateLimit)
  .post(
    '/:id/cancel',
    ({ user, params, set }) => safeCall(() => tripService.cancelTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  );

const completeRoute = new Elysia()
  .use(completeRateLimit)
  .post(
    '/:id/complete',
    ({ user, params, set }) => safeCall(() => tripService.completeTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  );

export const tripRoutes = new Elysia({ prefix: '/trips' })
  .use(authGuard)
  .post('/', ({ user, body, set }) => safeCall(() => tripService.createTrip(user, body), set), {
    body: createTripBody,
    requireAuth: true,
  })
  .get('/active', ({ user, set }) => safeCall(() => tripService.getActiveTrip(user), set), {
    requireAuth: true,
  })
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(
        () => tripService.getTripHistory(user, Number(query.page) || 1, Number(query.limit) || 20),
        set,
      ),
    { requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) => safeCall(() => tripService.getTripById(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .use(acceptRoute)
  .post(
    '/:id/reject',
    ({ user, params, set }) => safeCall(() => tripService.rejectTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/en-route',
    ({ user, params, set }) => safeCall(() => tripService.enRouteTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/arrived',
    ({ user, params, set }) => safeCall(() => tripService.arrivedTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .use(startRoute)
  .use(completeRoute)
  .use(cancelRoute)
  .put(
    '/:id/collect',
    ({ user, params, body, set }) =>
      safeCall(
        () => tripService.collectTrip(user, params.id, body.payment_method, body.mp_payment_id),
        set,
      ),
    { params: tripIdParams, body: collectBody, requireAuth: true },
  );
