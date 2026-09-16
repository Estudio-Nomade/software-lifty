import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { transitDriverIdParams, transitIssueBody } from './schema';
import { transitService } from './service';

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

export const transitRoutes = new Elysia({ prefix: '/transit' })
  .use(authGuard)
  .get(
    '/stats',
    ({ user, set }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(() => transitService.getStats(), set);
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
      };
      return safeCall(
        () =>
          transitService.listDrivers({
            q: q.q,
            identification_status: q.identification_status,
            page: q.page ? Number(q.page) : undefined,
            page_size: q.page_size ? Number(q.page_size) : undefined,
            limit: q.limit ? Number(q.limit) : undefined,
            offset: q.offset ? Number(q.offset) : undefined,
          }),
        set,
      );
    },
    { requireAuth: true },
  )
  .get(
    '/drivers/:id',
    ({ user, params, set }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(() => transitService.getDriver(params.id), set);
    },
    { params: transitDriverIdParams, requireAuth: true },
  )
  .post(
    '/drivers/:id/identification/issue',
    ({ user, params, body, set }) => {
      if (!requireTransitOrAdmin(user, set)) return forbiddenBody();
      return safeCall(() => transitService.issueIdentification(user, params.id, body), set);
    },
    { params: transitDriverIdParams, body: transitIssueBody, requireAuth: true },
  );
