import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { rateLimit } from '../../shared/middleware/ratelimit';
import { authGuard } from '../../shared/middleware/require-auth';
import { loginHintBody } from './schema';
import { authService } from './service';

const loginHintRateLimit = rateLimit({
  name: 'rate-limit-login-hint',
  keyPrefix: 'ratelimit:login-hint:ip',
  max: Number(process.env.LOGIN_HINT_IP_RATE_LIMIT_MAX) || 10,
  windowMs: Number(process.env.LOGIN_HINT_IP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');

/** Public: soft provider hint after failed password login (no tokens). */
const loginHintRoutes = new Elysia().use(loginHintRateLimit).post(
  '/login-hint',
  ({ body, set }) => {
    return safeCall(() => authService.getLoginHint(body.email), set);
  },
  {
    body: loginHintBody,
    detail: {
      tags: ['auth'],
      summary: 'Login provider hint (public, rate-limited)',
      description:
        'Tras fallo de password: { exists, methods? }. Rate limit IP + email. Sin ids/tokens.',
    },
  },
);

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(loginHintRoutes)
  .use(authGuard)
  .get('/me', ({ user, set }) => safeCall(() => authService.getMe(user), set), {
    requireAuth: true,
  })
  .post(
    '/logout',
    ({ user, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/logout');
      return safeCall(() => authService.logout(user), set);
    },
    {
      requireAuth: true,
    },
  );
