import { Elysia } from 'elysia';
import { t } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { clearBlock } from '../cancellations/blocks';
import { cancellationService, getCancellationConfig } from '../cancellations/service';
import { approveDriver } from './approve';
import { adminDashboardService } from './dashboard';
import { adminPushService } from './push-service';
import {
  adminTripsQuery,
  dashboardSummaryQuery,
  driverIdParams,
  driverTripsQuery,
  reviewBody,
  tripIdParams,
  updatePhaseSchema,
  updateStartDateSchema,
} from './schema';
import { adminService } from './service';

export const adminApproveRoute = new Elysia().get('/admin/approve', async ({ query, set }) => {
  const token = (query as any)?.token;
  if (!token) {
    set.status = 400;
    set.headers['Content-Type'] = 'text/html; charset=utf-8';
    return '<h1>Error</h1><p>Token requerido.</p>';
  }
  try {
    const result = await approveDriver(String(token));
    set.headers['Content-Type'] = 'text/html; charset=utf-8';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Aprobado</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:white;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center;max-width:400px}h1{color:#00C2B3;margin:0 0 12px}p{color:#555;margin:0}</style></head><body><div class="card"><h1>Conductor aprobado</h1><p>${result.message}</p></div></body></html>`;
  } catch (err) {
    set.status = (err as any)?.status ?? 500;
    set.headers['Content-Type'] = 'text/html; charset=utf-8';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:white;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center;max-width:400px}h1{color:#FF6B6B;margin:0 0 12px}p{color:#555;margin:0}</style></head><body><div class="card"><h1>Error</h1><p>${(err as Error).message}</p></div></body></html>`;
  }
});

function isAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuard)
  .get(
    '/dashboard/summary',
    ({ user, set, query }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      const range = (query as { range?: string }).range;
      const allowed = range === 'today' || range === '7d' || range === '30d' ? range : 'today';
      return safeCall(() => adminDashboardService.getDashboardSummary(allowed), set);
    },
    { query: dashboardSummaryQuery, requireAuth: true },
  )
  .get(
    '/trips',
    ({ user, set, query }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      const q = query as {
        limit?: string;
        offset?: string;
        status?: string;
        from?: string;
        to?: string;
        driver_id?: string;
        district_id?: string;
        q?: string;
      };
      return safeCall(
        () =>
          adminDashboardService.listGlobalTrips({
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
            status: q.status,
            from: q.from,
            to: q.to,
            driver_id: q.driver_id,
            district_id: q.district_id,
            q: q.q,
          }),
        set,
      );
    },
    { query: adminTripsQuery, requireAuth: true },
  )
  .get(
    '/trips/:trip_id',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminDashboardService.getGlobalTrip(params.trip_id), set);
    },
    { params: tripIdParams, requireAuth: true },
  )
  .get(
    '/drivers/pending',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.listPending(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/drivers',
    ({ user, set, query }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      const q = query as {
        q?: string;
        status?: string;
        identification_status?: string;
        limit?: string;
        offset?: string;
      };
      return safeCall(
        () =>
          adminService.listDrivers({
            q: q.q,
            status: q.status,
            identification_status: q.identification_status,
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
          }),
        set,
      );
    },
    { requireAuth: true },
  )
  .get(
    '/drivers/:driver_id/trips',
    ({ user, params, set, query }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      const q = query as {
        limit?: string;
        offset?: string;
        status?: string;
        from?: string;
        to?: string;
      };
      return safeCall(
        () =>
          adminDashboardService.listDriverTrips(params.driver_id, {
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
            status: q.status,
            from: q.from,
            to: q.to,
          }),
        set,
      );
    },
    { params: driverIdParams, query: driverTripsQuery, requireAuth: true },
  )
  .get(
    '/drivers/:driver_id',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getDriverDetail(params.driver_id), set);
    },
    { params: driverIdParams, requireAuth: true },
  )
  .post(
    '/drivers/:driver_id/review',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(
        () =>
          adminService.reviewDriver(
            user,
            params.driver_id,
            body.action,
            body.notes,
            body.reject_doc_types,
          ),
        set,
      );
    },
    { params: driverIdParams, body: reviewBody, requireAuth: true },
  )
  .get(
    '/commission/phases',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.listCommissionPhases(), set);
    },
    { requireAuth: true },
  )
  .put(
    '/commission/phases/:id',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.updateCommissionPhase(params.id, body), set);
    },
    { body: updatePhaseSchema, requireAuth: true },
  )
  .get(
    '/commission/start-date',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getCommissionStartDate(), set);
    },
    { requireAuth: true },
  )
  .put(
    '/commission/start-date',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.updateCommissionStartDate(body.value), set);
    },
    { body: updateStartDateSchema, requireAuth: true },
  )
  .get(
    '/commission/current',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getCurrentCommission(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/cancellations/config',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => getCancellationConfig(), set);
    },
    { requireAuth: true },
  )
  .put(
    '/cancellations/config',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => cancellationService.putConfig(body.key, body.value), set);
    },
    {
      body: t.Object({ key: t.String(), value: t.String() }),
      requireAuth: true,
    },
  )
  .post(
    '/cancellations/debt/:userId/clear',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => cancellationService.clearDebt(params.userId), set);
    },
    { requireAuth: true },
  )
  .post(
    '/cancellations/blocks/:id/clear',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => clearBlock(params.id), set);
    },
    { requireAuth: true },
  )
  .post(
    '/cancellations/payouts/:id/paid',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => cancellationService.markPayoutPaid(params.id), set);
    },
    { requireAuth: true },
  )
  .get(
    '/push/vapid-public-key',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => Promise.resolve(adminPushService.getVapidPublicKey()), set);
    },
    { requireAuth: true },
  )
  .post(
    '/push-subscription',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminPushService.subscribe(user, body), set);
    },
    {
      body: t.Object({
        endpoint: t.String({ minLength: 8 }),
        keys: t.Object({
          p256dh: t.String({ minLength: 1 }),
          auth: t.String({ minLength: 1 }),
        }),
      }),
      requireAuth: true,
    },
  )
  .delete(
    '/push-subscription',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      const endpoint =
        body && typeof body === 'object' && 'endpoint' in body
          ? String((body as { endpoint?: string }).endpoint ?? '')
          : undefined;
      return safeCall(() => adminPushService.unsubscribe(user, endpoint), set);
    },
    {
      body: t.Optional(t.Object({ endpoint: t.Optional(t.String()) })),
      requireAuth: true,
    },
  );
