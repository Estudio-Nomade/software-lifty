import { Elysia } from 'elysia';
import { safeCall } from '../../../shared/lib/route-utils';
import type { AuthUser } from '../../../shared/middleware/auth';
import { authGuard } from '../../../shared/middleware/require-auth';
import {
  createTransitOperatorBody,
  patchTransitOperatorBody,
  resetPasswordBody,
  userIdParams,
} from './schema';
import { transitOperatorsService } from './service';

function isAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

export const transitOperatorsRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuard)
  .get(
    '/districts',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => transitOperatorsService.listDistricts(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/transit-operators',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => transitOperatorsService.listOperators(), set);
    },
    { requireAuth: true },
  )
  .post(
    '/transit-operators',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(async () => {
        const result = await transitOperatorsService.createOperator(body, user.id);
        set.status = 201;
        return result;
      }, set);
    },
    { body: createTransitOperatorBody, requireAuth: true },
  )
  .patch(
    '/transit-operators/:userId',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(
        () => transitOperatorsService.patchOperator(params.userId, body, user.id),
        set,
      );
    },
    { params: userIdParams, body: patchTransitOperatorBody, requireAuth: true },
  )
  .post(
    '/transit-operators/:userId/password',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(
        () => transitOperatorsService.resetPassword(params.userId, body.password, user.id),
        set,
      );
    },
    { params: userIdParams, body: resetPasswordBody, requireAuth: true },
  )
  .post(
    '/transit-operators/:userId/disable',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => transitOperatorsService.disableOperator(params.userId, user.id), set);
    },
    { params: userIdParams, requireAuth: true },
  );
