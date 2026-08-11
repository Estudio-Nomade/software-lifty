import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { passengersService } from './service';

export const passengersRoutes = new Elysia({ prefix: '/passenger' })
  .use(authGuard)
  .post('/register', ({ user, set }) => safeCall(() => passengersService.register(user.id), set), {
    requireAuth: true,
  })
  .get('/profile', ({ user, set }) => safeCall(() => passengersService.getProfile(user), set), {
    requireAuth: true,
  });
