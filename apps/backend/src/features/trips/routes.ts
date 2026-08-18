import { Elysia } from 'elysia';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  arrivedBody,
  collectBody,
  completeBody,
  createTripBody,
  respondBody,
  sendMessageBody,
  startTripBody,
  tripIdParams,
  webhookTripRequestBody,
} from './schema';
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

const claimRateLimit = rateLimit({
  name: 'rate-limit-trip-claim',
  keyPrefix: 'ratelimit:trip:claim:ip',
  max: Number(process.env.TRIP_CLAIM_RATE_LIMIT_MAX) || 5,
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

const cancelRoute = new Elysia().use(cancelRateLimit).post(
  '/:id/cancel',
  ({ user, params, body, set }) =>
    safeCall(() => {
      const reason =
        (body as { reason?: string } | undefined)?.reason === 'no_show'
          ? 'no_show'
          : 'driver_cancel';
      return tripService.cancelTrip(user, params.id, reason);
    }, set),
  { params: tripIdParams, requireAuth: true },
);

const claimRoute = new Elysia()
  .use(claimRateLimit)
  .post(
    '/:id/claim',
    ({ user, params, set }) => safeCall(() => tripService.claimTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  );

const completeRoute = new Elysia()
  .use(completeRateLimit)
  .post(
    '/:id/complete',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.completeTrip(user, params.id, body), set),
    { params: tripIdParams, body: completeBody, requireAuth: true },
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
    '/:id/messages',
    ({ user, params, set }) => safeCall(() => tripService.listMessages(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/messages',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.sendMessage(user, params.id, body.text), set),
    { params: tripIdParams, body: sendMessageBody, requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) => safeCall(() => tripService.getTripById(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .use(acceptRoute)
  .use(claimRoute)
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
    ({ user, params, body, set }) =>
      safeCall(() => tripService.arrivedTrip(user, params.id, body), set),
    { params: tripIdParams, body: arrivedBody, requireAuth: true },
  )
  .use(startRoute)
  .use(completeRoute)
  .use(cancelRoute)
  .put(
    '/:id/collect',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.collectTrip(user, params.id, body.payment_method), set),
    { params: tripIdParams, body: collectBody, requireAuth: true },
  )
  .post(
    '/:id/respond',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.respondToTrip(user, params.id, body.action), set),
    { params: tripIdParams, body: respondBody, requireAuth: true },
  );

export const tripWebhookRoute = new Elysia({ prefix: '/trips' }).post(
  '/webhook/trip-request',
  async ({ body, set, request }) => {
    const apiKey = request.headers.get('X-API-Key') || '';
    const expectedKey = process.env.DISPATCH_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    return safeCall(async () => {
      const trip = await tripService.createPendingTrip(body);
      await tripService.offerTrip(trip.id);
      return trip;
    }, set);
  },
  { body: webhookTripRequestBody },
);
