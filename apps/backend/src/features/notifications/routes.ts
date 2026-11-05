import { Elysia } from 'elysia';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import { registerTokenBody, removeTokenQuery } from './schema';
import { notificationsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

// Token registration runs on session restore/GO/foreground; a legit client sends a few per
// minute, so a low per-IP cap only stops abuse (table growth, DB churn).
const tokenRateLimit = rateLimit({
  name: 'rate-limit-notification-token',
  keyPrefix: 'ratelimit:notifications:token:ip',
  // Tests register dozens of tokens per minute from one IP.
  max:
    Number(process.env.NOTIFICATION_TOKEN_RATE_LIMIT_MAX) ||
    (process.env.NODE_ENV === 'test' ? 10_000 : 30),
  windowMs: 60_000,
}).as('scoped');

export const notificationsRoutes = new Elysia({ prefix: '/notifications' })
  .use(authGuard)
  // Throttle registration only; unregister (logout) must never be rate limited.
  .group('', (app) =>
    app
      .use(tokenRateLimit)
      .post(
        '/token',
        ({ user, body, set }) =>
          safeCall(
            () => notificationsService.registerToken(user, body.token, body.platform, body.app),
            set,
          ),
        { body: registerTokenBody, requireAuth: true },
      ),
  )
  .delete(
    '/token',
    ({ user, query, set }) =>
      safeCall(() => notificationsService.removeToken(user, query.token), set),
    {
      query: removeTokenQuery,
      requireAuth: true,
    },
  );
