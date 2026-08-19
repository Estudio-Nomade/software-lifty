import { Elysia } from 'elysia';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  addDocumentBody,
  driverIdParams,
  heartbeatBody,
  reuploadDocBody,
  setDistrictBody,
  toggleOnlineBody,
  updateProfileBody,
  uploadDocBody,
  uploadPhotoBody,
} from './schema';
import { driversService } from './service';

import { safeCall } from '../../shared/lib/route-utils';
import { cancellationService } from '../cancellations/service';

const publicProfileRateLimit = rateLimit({
  name: 'rate-limit-public-profile',
  keyPrefix: 'ratelimit:public-profile:ip',
  max: Number(process.env.PUBLIC_PROFILE_RATE_LIMIT_MAX) || 10,
  windowMs: Number(process.env.PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

const publicProfileRoutes = new Elysia().use(publicProfileRateLimit).get(
  '/:id/profile',
  ({ params: { id }, set }) => {
    return safeCall(() => driversService.getPublicProfile(id), set);
  },
  {
    params: driverIdParams,
    detail: {
      tags: ['drivers'],
      summary: 'Perfil público del conductor',
      description:
        'Endpoint PÚBLICO (sin autenticación). Rate limit: 10 req/min por IP. Devuelve solo el primer nombre del conductor.',
    },
  },
);

export const driversRoutes = new Elysia({ prefix: '/drivers' })
  .use(authGuard)
  .use(publicProfileRoutes)
  .get('/me', ({ user, set }) => safeCall(() => driversService.getMyProfile(user), set), {
    requireAuth: true,
  })
  .get('/me/status', ({ user, set }) => safeCall(() => driversService.getMyStatus(user), set), {
    requireAuth: true,
  })
  .get(
    '/me/cancellation-metrics',
    ({ user, set }) => safeCall(() => cancellationService.getDriverCancellationMetrics(user), set),
    { requireAuth: true },
  )
  .put(
    '/me/online',
    ({ user, body, set }) => safeCall(() => driversService.toggleOnline(user, body.is_online), set),
    { body: toggleOnlineBody, requireAuth: true },
  )
  .put(
    '/me/heartbeat',
    ({ user, body, set }) => safeCall(() => driversService.heartbeat(user, body), set),
    { body: heartbeatBody, requireAuth: true },
  )
  .put(
    '/me',
    ({ user, body, set }) => safeCall(() => driversService.updateProfile(user, body), set),
    { body: updateProfileBody, requireAuth: true },
  )
  .post(
    '/me/documents',
    ({ user, body, set }) => safeCall(() => driversService.addDocument(user, body), set),
    { body: addDocumentBody, requireAuth: true },
  )
  .post(
    '/me/documents/upload',
    ({ user, body, set }) =>
      safeCall(() => driversService.uploadDocument(user, body.file, body.doc_type), set),
    { body: uploadDocBody, requireAuth: true },
  )
  .get(
    '/me/documents',
    ({ user, set }) => safeCall(() => driversService.listDocuments(user), set),
    {
      requireAuth: true,
    },
  )
  .post(
    '/me/documents/reupload',
    ({ user, body, set }) =>
      safeCall(() => driversService.reuploadDocument(user, body.file, body.doc_type), set),
    { body: reuploadDocBody, requireAuth: true },
  )
  .post(
    '/me/photo',
    ({ user, body, set }) => safeCall(() => driversService.uploadPhoto(user, body.file), set),
    { body: uploadPhotoBody, requireAuth: true },
  )
  .put(
    '/me/district',
    ({ user, body, set }) =>
      safeCall(() => driversService.setDistrict(user, body.district_id), set),
    { body: setDistrictBody, requireAuth: true },
  );
