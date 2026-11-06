import { Elysia } from 'elysia';
import {
  WebhookSecretMissingError,
  getDiditEnv,
  verifyWebhookSignature,
} from '../../shared/lib/didit';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { decisionParams, sessionParams } from './schema';
import { kycService, mapKycStatus } from './service';

function extractWebhookData(body: any): {
  userId: string;
  status: string;
  documentNumber?: string;
  fullName?: string;
} {
  const userId = body.vendor_data || body.user_id || body.driver_id;
  const status = mapKycStatus(body.status);

  const idv = body.decision?.id_verifications?.[0] ?? body.result ?? body;
  const documentNumber =
    body.document_number || body.documentNumber || idv?.document_number || idv?.documentNumber;
  const fullName =
    body.full_name ||
    body.fullName ||
    idv?.full_name ||
    idv?.fullName ||
    [idv?.first_name, idv?.last_name].filter(Boolean).join(' ') ||
    undefined;

  return { userId, status, documentNumber, fullName };
}

export const kycRoutes = new Elysia({ prefix: '/kyc' })
  .use(authGuard)
  .get('/me/session', ({ user, set }) => safeCall(() => kycService.createUserSession(user), set), {
    requireAuth: true,
  })
  .get(
    '/session/:driver_id',
    ({ user, params, set }) => safeCall(() => kycService.getSession(user, params.driver_id), set),
    { params: sessionParams, requireAuth: true },
  )
  .get(
    '/decision/:session_id',
    ({ user, params, set }) =>
      safeCall(() => kycService.refreshDecision(user, params.session_id), set),
    { params: decisionParams, requireAuth: true },
  )
  .post('/webhook/didit', async ({ request, set }) => {
    // DIDIT sends X-Signature-V2 (canonical JSON, preferred) and X-Signature
    // (raw-body HMAC); X-Didit-Signature is kept for backward-compat / tests.
    const text = await request.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      set.status = 400;
      return { error: 'Bad Request', message: 'Invalid JSON body' };
    }

    const timestampStr = request.headers.get('X-Timestamp');
    if (!timestampStr) {
      set.status = 401;
      return { error: 'Unauthorized', message: 'Missing X-Timestamp header' };
    }
    const timestamp = Number.parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
      set.status = 401;
      return { error: 'Unauthorized', message: 'Timestamp expired' };
    }
    // The X-Timestamp header is not covered by the signature; the body's own
    // `timestamp` is (V2), so a captured webhook cannot be replayed with a fresh header.
    if (typeof body?.timestamp === 'number' && Math.abs(now - body.timestamp) > 300) {
      set.status = 401;
      return { error: 'Unauthorized', message: 'Timestamp expired' };
    }

    try {
      if (!verifyWebhookSignature({ rawBody: text, parsedBody: body, headers: request.headers })) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Invalid HMAC signature' };
      }
    } catch (err) {
      if (err instanceof WebhookSecretMissingError) {
        set.status = 503;
        return { error: 'Service Unavailable', message: 'Webhook secret not configured' };
      }
      throw err;
    }

    // Never let a sandbox event move KYC state on a live deployment (or vice versa).
    if (typeof body?.environment === 'string' && body.environment !== getDiditEnv()) {
      logger.error('[KYC] Ignoring webhook from mismatched Didit environment', {
        received: body.environment,
        expected: getDiditEnv(),
      });
      return { message: 'Ignored: environment mismatch' };
    }

    const { userId, status, documentNumber, fullName } = extractWebhookData(body);

    if (!userId || !status) {
      set.status = 400;
      return { error: 'Bad Request', message: 'userId and status are required' };
    }

    return safeCall(
      () =>
        kycService
          .processWebhook(userId, status, { documentNumber, fullName })
          .then(() => ({ message: 'Webhook processed' })),
      set,
    );
  });
