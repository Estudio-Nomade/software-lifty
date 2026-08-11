import { Elysia } from 'elysia';
import { AppError } from '../../shared/lib/errors';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { requestTripBody, tripIdParams } from './schema';
import { passengerTripService } from './service';

function requirePassenger(user: { role: string }) {
  if (user.role !== 'passenger') {
    throw new AppError('Only passengers can access this endpoint', 403, 'FORBIDDEN');
  }
}

export const passengerTripRoutes = new Elysia({ prefix: '/passenger/trips' })
  .use(authGuard)
  .post(
    '/request',
    ({ user, body, set }) => {
      requirePassenger(user);
      return safeCall(() => passengerTripService.requestTrip(user, body), set);
    },
    { body: requestTripBody, requireAuth: true },
  )
  .get(
    '/active',
    ({ user, set }) => {
      requirePassenger(user);
      return safeCall(() => passengerTripService.getActiveTrip(user), set);
    },
    { requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) => {
      requirePassenger(user);
      return safeCall(() => passengerTripService.getTripById(user, params.id), set);
    },
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/cancel',
    ({ user, params, set }) => {
      requirePassenger(user);
      return safeCall(() => passengerTripService.cancelTrip(user, params.id), set);
    },
    { params: tripIdParams, requireAuth: true },
  );
