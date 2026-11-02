import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { createServiceMarketBody, marketIdParams, patchServiceMarketBody } from './schema';
import { serviceMarketsService } from './service';

function isAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

/** Public-ish list of active markets for mobile mirror (auth required). */
export const serviceMarketsPublicRoutes = new Elysia({ prefix: '/service-markets' })
  .use(authGuard)
  .get('/active', ({ set }) => safeCall(() => serviceMarketsService.listActivePublic(), set), {
    requireAuth: true,
  });

export const serviceMarketsAdminRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuard)
  .get(
    '/service-markets',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => serviceMarketsService.listAdmin(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/service-markets/:id',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => serviceMarketsService.getById(params.id), set);
    },
    { params: marketIdParams, requireAuth: true },
  )
  .post(
    '/service-markets',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(async () => {
        const result = await serviceMarketsService.create(body);
        set.status = 201;
        return result;
      }, set);
    },
    { body: createServiceMarketBody, requireAuth: true },
  )
  .patch(
    '/service-markets/:id',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => serviceMarketsService.patch(params.id, body), set);
    },
    { params: marketIdParams, body: patchServiceMarketBody, requireAuth: true },
  )
  .post(
    '/service-markets/:id/activate',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => serviceMarketsService.setStatus(params.id, 'active'), set);
    },
    { params: marketIdParams, requireAuth: true },
  )
  .post(
    '/service-markets/:id/pause',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => serviceMarketsService.setStatus(params.id, 'paused'), set);
    },
    { params: marketIdParams, requireAuth: true },
  );
