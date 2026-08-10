import { Elysia } from 'elysia';
import { safeCall } from '../../../shared/lib/route-utils';
import type { AuthUser } from '../../../shared/middleware/auth';
import { authGuard } from '../../../shared/middleware/require-auth';
import { setFuelPriceBody } from './schema';
import { fuelPriceService } from './service';

function isAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

export const fuelPriceRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuard)
  .get(
    '/fuel-price/status',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => fuelPriceService.getStatus(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/fuel-price/history',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => fuelPriceService.getHistory(), set);
    },
    { requireAuth: true },
  )
  .post(
    '/fuel-price',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => fuelPriceService.setPrice(body, user.email ?? user.id), set);
    },
    { body: setFuelPriceBody, requireAuth: true },
  );
