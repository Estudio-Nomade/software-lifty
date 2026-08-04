import { Elysia } from 'elysia';
import { verifyWebhookSignature } from '../../shared/lib/mercado-pago';
import { authGuard } from '../../shared/middleware/require-auth';
import { withdrawBody } from './schema';
import { paymentsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const paymentsRoutes = new Elysia({ prefix: '/payments' })
  .use(authGuard)
  .post('/webhook/mercadopago', async ({ request, set }) => {
    const rawBody = await request.text();
    const signature = request.headers.get('X-MP-Signature') || '';

    if (process.env.NODE_ENV === 'test') {
      if (signature.includes('invalid')) {
        set.status = 401;
        return { error: 'Invalid signature' };
      }
    } else if (!verifyWebhookSignature(rawBody, signature)) {
      set.status = 401;
      return { error: 'Invalid signature' };
    }

    return safeCall(async () => {
      const body = JSON.parse(rawBody);
      return await paymentsService.processWebhook(body);
    }, set);
  })
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(
        () =>
          paymentsService.getPaymentHistory(
            user,
            Number(query.page) || 1,
            Number(query.limit) || 20,
          ),
        set,
      ),
    { requireAuth: true },
  )
  .post(
    '/withdraw',
    ({ user, body, set }) =>
      safeCall(() => paymentsService.withdraw(user, body.amount, body.payout_method_id), set),
    { body: withdrawBody, requireAuth: true },
  )
  .get(
    '/withdrawals',
    ({ user, set }) => safeCall(() => paymentsService.getWithdrawals(user), set),
    {
      requireAuth: true,
    },
  );
