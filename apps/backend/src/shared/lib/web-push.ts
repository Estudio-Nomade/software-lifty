import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import { logger } from './logger';
import type { PushMessage } from './push';

export type WebPushSubscriptionRow = {
  id: string;
  user_id: string;
  token: string;
  web_p256dh: string | null;
  web_auth: string | null;
};

function isWebPushEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.SEND_WEB_PUSH_IN_DEV === 'true' || process.env.SEND_PUSH_IN_DEV === 'true';
}

function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:ops@liftyviajes.com';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

let vapidConfigured = false;

function ensureVapid(): boolean {
  const cfg = getVapidConfig();
  if (!cfg) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    vapidConfigured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

export async function sendWebPushNotification(
  sub: WebPushSubscriptionRow,
  message: PushMessage,
): Promise<'ok' | 'gone' | 'fail'> {
  if (!isWebPushEnabled()) {
    logger.info('[WEB-PUSH] disabled — not sending', {
      title: message.title,
      endpoint: sub.token.slice(0, 48),
    });
    return 'fail';
  }

  if (!ensureVapid()) {
    logger.warn('[WEB-PUSH] VAPID not configured — skip');
    return 'fail';
  }

  if (!sub.web_p256dh || !sub.web_auth) {
    logger.warn('[WEB-PUSH] missing keys', { id: sub.id });
    return 'fail';
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.token,
        keys: { p256dh: sub.web_p256dh, auth: sub.web_auth },
      },
      payload,
    );
    logger.info('[WEB-PUSH] sent', { userId: sub.user_id, title: message.title });
    return 'ok';
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      logger.warn('[WEB-PUSH] endpoint gone', { id: sub.id, statusCode });
      return 'gone';
    }
    logger.error('[WEB-PUSH] send failed', {
      id: sub.id,
      error: (err as Error).message,
      statusCode,
    });
    return 'fail';
  }
}

/** Fan-out to all admin users with platform=web subscriptions. Removes 410 endpoints. */
export async function sendWebPushToAdmins(message: PushMessage): Promise<number> {
  try {
    const { db } = await import('../db/client');
    const { pushTokens } = await import('../db/schema/push-tokens');
    const { users } = await import('../db/schema/users');

    const rows = await db
      .select({
        id: pushTokens.id,
        user_id: pushTokens.user_id,
        token: pushTokens.token,
        web_p256dh: pushTokens.web_p256dh,
        web_auth: pushTokens.web_auth,
      })
      .from(pushTokens)
      .innerJoin(users, eq(pushTokens.user_id, users.id))
      .where(and(eq(pushTokens.platform, 'web'), eq(users.role, 'admin')));

    if (rows.length === 0) {
      logger.info('[WEB-PUSH] no admin web subscriptions');
      return 0;
    }

    let sent = 0;
    for (const row of rows) {
      const result = await sendWebPushNotification(row, message);
      if (result === 'ok') sent += 1;
      if (result === 'gone') {
        await db.delete(pushTokens).where(eq(pushTokens.id, row.id));
      }
    }
    return sent;
  } catch (err) {
    logger.error('[WEB-PUSH] sendWebPushToAdmins error', { error: (err as Error).message });
    return 0;
  }
}
