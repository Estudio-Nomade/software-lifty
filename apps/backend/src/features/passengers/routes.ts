import { Elysia, t } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { passengersService } from './service';

export const passengersRoutes = new Elysia({ prefix: '/passenger' })
  .use(authGuard)
  .post(
    '/register',
    ({ user, body, set }) =>
      safeCall(() => passengersService.register(user.id, body?.phone, body?.full_name), set),
    {
      requireAuth: true,
      body: t.Optional(
        t.Object({
          phone: t.Optional(t.String()),
          full_name: t.Optional(t.String()),
        }),
      ),
    },
  )
  .get('/profile', ({ user, set }) => safeCall(() => passengersService.getProfile(user), set), {
    requireAuth: true,
  })
  .put(
    '/profile',
    ({ user, body, set }) => safeCall(() => passengersService.updateProfile(user, body), set),
    {
      requireAuth: true,
      body: t.Optional(
        t.Object({
          full_name: t.Optional(t.String()),
          phone: t.Optional(t.String()),
        }),
      ),
    },
  )
  .post(
    '/profile/photo',
    ({ user, body, set }) => safeCall(() => passengersService.uploadAvatar(user, body.file), set),
    {
      requireAuth: true,
      body: t.Object({
        file: t.File({ maxSize: 10 * 1024 * 1024 }),
      }),
    },
  );
