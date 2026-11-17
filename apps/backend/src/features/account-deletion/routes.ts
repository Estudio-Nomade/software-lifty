import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import { secretsEqual } from '../transit-bridge/auth';
import { appRequestBody, internalProcessBody, webRequestBody, webVerifyBody } from './schema';
import { accountDeletionService } from './service';

const webRequestRateLimit = rateLimit({
  name: 'rate-limit-account-deletion-web',
  keyPrefix: 'ratelimit:account-deletion:web:ip',
  max: Number(process.env.ACCOUNT_DELETION_WEB_IP_RATE_MAX) || 5,
  windowMs: Number(process.env.ACCOUNT_DELETION_WEB_IP_RATE_WINDOW_MS) || 3_600_000,
}).as('scoped');

const webVerifyRateLimit = rateLimit({
  name: 'rate-limit-account-deletion-verify',
  keyPrefix: 'ratelimit:account-deletion:verify:ip',
  max: Number(process.env.ACCOUNT_DELETION_VERIFY_IP_RATE_MAX) || 20,
  windowMs: Number(process.env.ACCOUNT_DELETION_VERIFY_IP_RATE_WINDOW_MS) || 3_600_000,
}).as('scoped');

function extractProcessSecret(
  headers: Headers | Record<string, string | undefined>,
): string | null {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower) return v;
    }
    return undefined;
  };
  const custom = get('x-account-deletion-secret');
  if (custom?.trim()) return custom.trim();
  const auth = get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

const publicWebRoutes = new Elysia()
  .use(webRequestRateLimit)
  .post(
    '/web/request',
    ({ body, set }) => safeCall(() => accountDeletionService.requestFromWeb(body), set),
    {
      body: webRequestBody,
      detail: {
        tags: ['account-deletion'],
        summary: 'Web account deletion request (public, anti-enum)',
      },
    },
  );

const publicVerifyRoutes = new Elysia()
  .use(webVerifyRateLimit)
  .post(
    '/web/verify',
    ({ body, set }) => safeCall(() => accountDeletionService.verifyWebToken(body), set),
    {
      body: webVerifyBody,
      detail: {
        tags: ['account-deletion'],
        summary: 'Verify one-time web deletion token',
      },
    },
  );

const authedRoutes = new Elysia()
  .use(authGuard)
  .post(
    '/request',
    ({ user, body, set }) => safeCall(() => accountDeletionService.requestFromApp(user, body), set),
    {
      body: appRequestBody,
      requireAuth: true,
      detail: {
        tags: ['account-deletion'],
        summary: 'Authenticated app account deletion request',
      },
    },
  )
  .get('/me', ({ user, set }) => safeCall(() => accountDeletionService.getMine(user), set), {
    requireAuth: true,
    detail: {
      tags: ['account-deletion'],
      summary: 'Latest deletion request for current user',
    },
  });

export const accountDeletionRoutes = new Elysia({ prefix: '/account-deletion' })
  .use(publicWebRoutes)
  .use(publicVerifyRoutes)
  .use(authedRoutes);

/** Server-to-server process runner (same pattern as transit bridge). */
export const accountDeletionInternalRoutes = new Elysia({
  prefix: '/internal/account-deletion',
}).post(
  '/process',
  ({ body, request, set }) => {
    return safeCall(async () => {
      const expected = process.env.ACCOUNT_DELETION_PROCESS_SECRET;
      if (!expected?.trim()) {
        set.status = 503;
        return {
          error: {
            code: 'PROCESS_NOT_CONFIGURED',
            message: 'Account deletion process secret not configured',
            status: 503,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }
      const provided = extractProcessSecret(request.headers);
      if (!provided || !secretsEqual(provided, expected.trim())) {
        set.status = 401;
        return {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing process secret',
            status: 401,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }
      return accountDeletionService.processInternal(body.request_id);
    }, set);
  },
  {
    body: internalProcessBody,
    detail: {
      tags: ['account-deletion'],
      summary: 'Internal process runner (secret)',
    },
  },
);
