import { Elysia, t } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { assertNotStaff } from '../../shared/middleware/roles';
import { passengersService } from './service';

const homeFields = {
  home_address_line: t.Optional(t.String()),
  home_lat: t.Optional(t.Number()),
  home_lng: t.Optional(t.Number()),
  home_resolved_city: t.Optional(t.Union([t.String(), t.Null()])),
  home_resolved_province: t.Optional(t.Union([t.String(), t.Null()])),
};

export const passengersRoutes = new Elysia({ prefix: '/passenger' })
  .use(authGuard)
  .post(
    '/register',
    ({ user, body, set }) =>
      safeCall(async () => {
        assertNotStaff(user);
        return passengersService.register(user.id, body?.phone, body?.full_name, body);
      }, set),
    {
      requireAuth: true,
      body: t.Optional(
        t.Object({
          phone: t.Optional(t.String()),
          full_name: t.Optional(t.String()),
          ...homeFields,
        }),
      ),
    },
  )
  .get(
    '/profile',
    ({ user, set }) =>
      safeCall(async () => {
        assertNotStaff(user);
        return passengersService.getProfile(user);
      }, set),
    {
      requireAuth: true,
    },
  )
  .put(
    '/profile',
    ({ user, body, set }) =>
      safeCall(async () => {
        assertNotStaff(user);
        return passengersService.updateProfile(user, body ?? {});
      }, set),
    {
      requireAuth: true,
      body: t.Optional(
        t.Object({
          full_name: t.Optional(t.String()),
          phone: t.Optional(t.String()),
          ...homeFields,
        }),
      ),
    },
  )
  .get(
    '/service-area/status',
    ({ user, query, set }) =>
      safeCall(async () => {
        assertNotStaff(user);
        const lat = Number(query.lat);
        const lng = Number(query.lng);
        return passengersService.getServiceAreaStatus(lat, lng);
      }, set),
    {
      requireAuth: true,
      query: t.Object({
        lat: t.String(),
        lng: t.String(),
      }),
    },
  )
  .post(
    '/profile/photo',
    ({ user, body, set }) =>
      safeCall(async () => {
        assertNotStaff(user);
        return passengersService.uploadAvatar(user, body.file);
      }, set),
    {
      requireAuth: true,
      body: t.Object({
        file: t.File({ maxSize: 10 * 1024 * 1024 }),
      }),
    },
  );
