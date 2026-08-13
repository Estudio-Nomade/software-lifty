import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { approveDriver } from './approve';
import { driverIdParams, reviewBody, updatePhaseSchema, updateStartDateSchema } from './schema';
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
    '/drivers/pending',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.listPending(), set);
    },
    { requireAuth: true },
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
        () => adminService.reviewDriver(user, params.driver_id, body.action, body.notes),
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
  );
