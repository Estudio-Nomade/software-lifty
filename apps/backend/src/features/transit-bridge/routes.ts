import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { validateTransitBridgeAuth } from './auth';
import { issueIdentificationBody } from './schema';
import { transitBridgeService } from './service';

/**
 * Internal server-to-server bridge for web-tránsito.
 * Auth: Authorization: Bearer <TRANSIT_BRIDGE_SECRET>
 *    or X-Transit-Bridge-Secret: <TRANSIT_BRIDGE_SECRET>
 * No JWT / no admin role.
 */
export const transitBridgeRoutes = new Elysia({ prefix: '/internal/transit' }).post(
  '/identification/issue',
  async ({ body, request, set }) => {
    const auth = validateTransitBridgeAuth(request.headers);
    if (!auth.ok) {
      set.status = auth.status;
      return {
        error: { code: auth.code, message: auth.message, status: auth.status },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    return safeCall(() => transitBridgeService.issueIdentification(body), set);
  },
  { body: issueIdentificationBody },
);
