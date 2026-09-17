import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { transitDriverIdParams, transitIssueBody } from './schema';
import { resolveTransitScope, transitService } from './service';

function requireTransitOrAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'transit' && user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

function forbiddenBody() {
  return {
    error: { code: 'FORBIDDEN', message: 'Transit or admin role required', status: 403 },
    meta: { timestamp: new Date().toISOString() },
  };
}

function parseDistrictQuery(query: Record<string, unknown> | undefined): string | undefined {
  const raw = query?.district_id;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export const transitRoutes = new Elysia({ prefix: '/transit' })
  // Public catalog for pre-login municipality picker (active only; no secrets).
  .get('/districts', ({ set }) => safeCall(() => transitService.listActiveDistricts(), set))
  .use(authGuard)
  .get(
    '/stats',
    ({ user, set, query }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(async () => {
        const scope = await resolveTransitScope(
          user,
          parseDistrictQuery(query as Record<string, unknown>),
        );
        return transitService.getStats(scope);
      }, set);
    },
    { requireAuth: true },
  )
  .get(
    '/drivers',
    ({ user, set, query }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      const q = query as {
        q?: string;
        identification_status?: string;
        page?: string;
        page_size?: string;
        limit?: string;
        offset?: string;
        district_id?: string;
      };
      return safeCall(async () => {
        const scope = await resolveTransitScope(user, q.district_id);
        return transitService.listDrivers(scope, {
          q: q.q,
          identification_status: q.identification_status,
          page: q.page ? Number(q.page) : undefined,
          page_size: q.page_size ? Number(q.page_size) : undefined,
          limit: q.limit ? Number(q.limit) : undefined,
          offset: q.offset ? Number(q.offset) : undefined,
        });
      }, set);
    },
    { requireAuth: true },
  )
  .get(
    '/drivers/:id',
    ({ user, params, set, query }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(async () => {
        const scope = await resolveTransitScope(
          user,
          parseDistrictQuery(query as Record<string, unknown>),
        );
        return transitService.getDriver(scope, params.id);
      }, set);
    },
    { params: transitDriverIdParams, requireAuth: true },
  )
  .post(
    '/drivers/:id/identification/issue',
    ({ user, params, body, set, query }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(async () => {
        const scope = await resolveTransitScope(
          user,
          parseDistrictQuery(query as Record<string, unknown>),
        );
        return transitService.issueIdentification(user, scope, params.id, body);
      }, set);
    },
    { params: transitDriverIdParams, body: transitIssueBody, requireAuth: true },
  );
