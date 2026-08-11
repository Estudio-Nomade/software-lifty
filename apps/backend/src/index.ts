import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { fuelPriceRoutes } from './features/admin/fuel-price/routes';
import { adminApproveRoute, adminRoutes } from './features/admin/routes';
import { authRoutes } from './features/auth/routes';
import { districtsRoutes } from './features/districts/routes';
import { driversRoutes } from './features/drivers/routes';
import { driverStatsRoutes, earningsRoutes } from './features/earnings/routes';
import { kycRoutes } from './features/kyc/routes';
import { locationHttpPlugin, locationWsPlugin } from './features/location/routes';
import { mapsRoutes } from './features/maps/routes';
import { notificationsRoutes } from './features/notifications/routes';
import { passengerTripRoutes } from './features/passenger-trips/routes';
import { paymentMethodsRoutes } from './features/payment-methods/routes';
import { paymentsRoutes } from './features/payments/routes';
import { ratingsRoutes } from './features/ratings/routes';
import { sosRoutes } from './features/sos/routes';
import { tripRoutes, tripWebhookRoute } from './features/trips/routes';
import { tripService } from './features/trips/service';
import { getDb, getPool, resetDb } from './shared/db/client';
import { startStaleDriverCleanup, stopStaleDriverCleanup } from './shared/lib/cleanup';
import { runReadyChecks } from './shared/lib/health';
import { logger } from './shared/lib/logger';
import { dbPoolAvailable, dbPoolSize, registry } from './shared/lib/metrics';
import { closeRedis, getRedis } from './shared/lib/redis';
import { authPlugin } from './shared/middleware/auth';
import { metricsMiddleware } from './shared/middleware/metrics';
import { rateLimit } from './shared/middleware/ratelimit';
import { requestId } from './shared/middleware/request-id';
import { cors, securityHeaders } from './shared/middleware/security';

function validateEnv() {
  const required = ['SUPABASE_URL', 'DATABASE_URL', 'RESEND_API_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  const port = process.env.PORT;
  if (port !== undefined && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    throw new Error('PORT must be a valid port number (1-65535)');
  }
}

if (process.env.NODE_ENV === 'production') {
  validateEnv();
}

export function createApp(customAuthPlugin?: typeof authPlugin) {
  const app = new Elysia();

  if (process.env.NODE_ENV !== 'production') {
    app.use(
      swagger({
        path: '/docs',
        documentation: {
          info: {
            title: 'Lifty API',
            version: '1.0.0',
            description: 'Driver-Side MVP — Lifty backend. 49 endpoints, 15 DB tables, 111 tests.',
          },
          tags: [
            { name: 'auth', description: 'Perfil y logout (auth via Supabase)' },
            { name: 'kyc', description: 'Verificación de identidad DIDIT' },
            { name: 'trips', description: 'State machine de viajes' },
            { name: 'location', description: 'WebSocket ubicación en tiempo real' },
            { name: 'maps', description: 'Proxy Google Maps' },
            { name: 'payments', description: 'Webhook Mercado Pago + withdrawals' },
            { name: 'earnings', description: 'Ganancias y estadísticas' },
            { name: 'ratings', description: 'Calificaciones' },
            { name: 'sos', description: 'Emergencias' },
            { name: 'notifications', description: 'Push tokens FCM' },
            { name: 'drivers', description: 'Perfil público y privado' },
            { name: 'districts', description: 'Zonas operativas' },
          ],
        },
      }),
    );
  }

  app
    .use(cors)
    .use(securityHeaders)
    .use(requestId)
    .use(metricsMiddleware)
    .use(
      rateLimit({
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
        max: Number(process.env.RATE_LIMIT_MAX) || 100,
      }),
    )
    .use(customAuthPlugin ?? authPlugin)
    .use(locationWsPlugin)
    .group('/api', (app) =>
      app
        .use(authRoutes)
        .use(adminApproveRoute)
        .use(adminRoutes)
        .use(fuelPriceRoutes)
        .use(paymentMethodsRoutes)
        .use(kycRoutes)
        .use(tripRoutes)
        .use(tripWebhookRoute)
        .use(mapsRoutes)
        .use(paymentsRoutes)
        .use(earningsRoutes)
        .use(driverStatsRoutes)
        .use(ratingsRoutes)
        .use(sosRoutes)
        .use(notificationsRoutes)
        .use(driversRoutes)
        .use(districtsRoutes)
        .use(passengerTripRoutes)
        .use(locationHttpPlugin),
    )
    .get('/health', async ({ set }) => {
      const checks: Record<string, string> = {};
      let degraded = false;

      try {
        await getDb().execute('SELECT 1');
        checks.database = 'connected';
      } catch (err) {
        checks.database = 'disconnected';
        degraded = true;
        logger.warn('[HEALTH] DB check failed', { error: (err as Error).message });
      }

      const redis = getRedis();
      if (redis) {
        try {
          await redis.ping();
          checks.redis = 'connected';
        } catch (err) {
          checks.redis = 'disconnected';
          degraded = true;
          logger.warn('[HEALTH] Redis check failed', { error: (err as Error).message });
        }
      } else {
        checks.redis = 'unconfigured';
      }

      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        checks.mercadopago = 'configured';
      }
      if (process.env.RESEND_API_KEY) {
        checks.resend = 'configured';
      }
      if (process.env.SUPABASE_URL) {
        checks.supabase = 'configured';
      }
      if (process.env.DIDIT_API_KEY) {
        checks.didit = 'configured';
      }

      set.status = degraded ? 200 : 200;
      return {
        status: degraded ? 'degraded' : 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
      };
    })
    .get('/ready', async ({ set }) => {
      const { ready, reason } = await runReadyChecks();
      if (!ready) {
        set.status = 503;
        return { status: 'not ready', reason };
      }
      return { status: 'ready' };
    })
    .get('/metrics', ({ set }) => {
      const pool = getPool();
      if (pool) {
        dbPoolSize.set({}, pool.totalCount);
        dbPoolAvailable.set({}, pool.idleCount);
      }
      set.headers['Content-Type'] = 'text/plain; version=0.0.4; charset=utf-8';
      return registry.getPrometheusText();
    });

  app.onError(({ code, error, set, request }) => {
    const e = error as Error;
    const msg = e?.message ?? 'Unknown error';
    const status = set.status ?? 500;
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const url = request ? new URL(request.url) : null;

    logger.error(
      `[ERROR] ${code ?? 'UNKNOWN'} ${request?.method ?? '?'} ${url?.pathname ?? '?'} → ${msg}`,
      {
        code: code ?? 'UNKNOWN',
        status,
        method: request?.method ?? '?',
        path: url?.pathname ?? '?',
        ...(isDev && e?.stack ? { stack: e.stack } : {}),
      },
    );

    switch (code) {
      case 'NOT_FOUND':
        set.status = 404;
        return {
          error: { code: 'NOT_FOUND', message: msg, status: 404 },
          meta: { timestamp: new Date().toISOString() },
        };
      case 'VALIDATION':
        set.status = 400;
        return {
          error: { code: 'VALIDATION_ERROR', message: msg, status: 400 },
          meta: { timestamp: new Date().toISOString() },
        };
      default:
        set.status = status;
        return {
          error: {
            code: 'INTERNAL_ERROR',
            message: isDev ? msg : 'Something went wrong',
            status,
          },
          meta: { timestamp: new Date().toISOString() },
        };
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = createApp().listen(process.env.PORT || 3000);
  logger.info('Server running on port', String(app.server?.port));

  startStaleDriverCleanup();

  const offerExpirer = setInterval(() => {
    tripService.expireStaleOffers().catch((err) => {
      logger.error('[offerExpirer] Error:', (err as Error).message);
    });
  }, 5_000);

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    clearInterval(offerExpirer);
    stopStaleDriverCleanup();
    await app.stop();
    resetDb();
    await closeRedis();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    clearInterval(offerExpirer);
    stopStaleDriverCleanup();
    await app.stop();
    resetDb();
    await closeRedis();
    process.exit(0);
  });
}
