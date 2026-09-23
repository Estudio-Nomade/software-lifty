import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { pushTokens } from '../../shared/db/schema';
import { AppError } from '../../shared/lib/errors';
import { getVapidPublicKey } from '../../shared/lib/web-push';
import type { AuthUser } from '../../shared/middleware/auth';

export const adminPushService = {
  getVapidPublicKey() {
    const key = getVapidPublicKey();
    if (!key) {
      throw new AppError('Web push not configured', 503, 'VAPID_NOT_CONFIGURED');
    }
    return { publicKey: key };
  },

  async subscribe(
    user: AuthUser,
    body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    if (user.role !== 'admin') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const endpoint = body.endpoint.trim();
    const p256dh = body.keys.p256dh.trim();
    const auth = body.keys.auth.trim();
    if (!endpoint || !p256dh || !auth) {
      throw new AppError('Invalid subscription', 400, 'BAD_REQUEST');
    }

    const [existing] = await db
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(and(eq(pushTokens.user_id, user.id), eq(pushTokens.token, endpoint)))
      .limit(1);

    if (existing) {
      await db
        .update(pushTokens)
        .set({
          platform: 'web',
          web_p256dh: p256dh,
          web_auth: auth,
        })
        .where(eq(pushTokens.id, existing.id));
    } else {
      await db.insert(pushTokens).values({
        user_id: user.id,
        token: endpoint,
        platform: 'web',
        web_p256dh: p256dh,
        web_auth: auth,
      });
    }

    return { message: 'Subscription registered' };
  },

  async unsubscribe(user: AuthUser, endpoint?: string) {
    if (user.role !== 'admin') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (endpoint?.trim()) {
      await db
        .delete(pushTokens)
        .where(
          and(
            eq(pushTokens.user_id, user.id),
            eq(pushTokens.token, endpoint.trim()),
            eq(pushTokens.platform, 'web'),
          ),
        );
    } else {
      await db
        .delete(pushTokens)
        .where(and(eq(pushTokens.user_id, user.id), eq(pushTokens.platform, 'web')));
    }

    return { message: 'Subscription removed' };
  },
};
