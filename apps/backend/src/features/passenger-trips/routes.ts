import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { cancellationService } from '../cancellations/service';
import { passengersService } from '../passengers/service';
import { tripService } from '../trips/service';
import { rateTripBody, requestTripBody, sendMessageBody, tripIdParams } from './schema';
import { passengerTripService } from './service';

async function asPassenger(user: AuthUser) {
  await passengersService.register(user.id);
}

export const passengerTripRoutes = new Elysia({ prefix: '/passenger/trips' })
  .use(authGuard)
  .post(
    '/request',
    ({ user, body, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.requestTrip(user, body);
      }, set),
    { body: requestTripBody, requireAuth: true },
  )
  .get(
    '/active',
    ({ user, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.getActiveTrip(user);
      }, set),
    { requireAuth: true },
  )
  .post(
    '/:id/retry',
    ({ user, params, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.retryTrip(user, params.id);
      }, set),
    { params: tripIdParams, requireAuth: true },
  )
  .get(
    '/debt',
    ({ user, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return cancellationService.getPassengerDebt(user.id);
      }, set),
    { requireAuth: true },
  )
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.getTripHistory(
          user,
          Number(query.page) || 1,
          Number(query.limit) || 20,
        );
      }, set),
    { requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.getTripById(user, params.id);
      }, set),
    { params: tripIdParams, requireAuth: true },
  )
  .get(
    '/:id/cancel-preview',
    ({ user, params, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return cancellationService.previewForPassenger(user, params.id);
      }, set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/cancel',
    ({ user, params, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.cancelTrip(user, params.id);
      }, set),
    { params: tripIdParams, requireAuth: true },
  )
  .get(
    '/:id/messages',
    ({ user, params, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return tripService.listMessages(user, params.id);
      }, set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/messages',
    ({ user, params, body, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return tripService.sendMessage(user, params.id, body.text);
      }, set),
    { params: tripIdParams, body: sendMessageBody, requireAuth: true },
  )
  .post(
    '/:id/rate',
    ({ user, params, body, set }) =>
      safeCall(async () => {
        await asPassenger(user);
        return passengerTripService.rateTrip(user, params.id, body);
      }, set),
    { params: tripIdParams, body: rateTripBody, requireAuth: true },
  );
