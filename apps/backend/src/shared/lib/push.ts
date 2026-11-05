import { and, eq } from 'drizzle-orm';
import { logger } from './logger';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android Expo channel; defaults to trip-requests for trip alerts. */
  channelId?: string;
  /**
   * Expo push sound. Use `'default'` or a filename registered in the app
   * (e.g. `trip-request.wav` via expo-notifications sounds plugin).
   */
  sound?: string;
  /** iOS app-icon badge (and Android when supported via Expo). */
  badge?: number;
  /**
   * Destination app. Delivered to tokens registered for that app plus 'legacy'
   * (pre-per-app) rows. Omit only for messages that make sense in both apps.
   */
  app?: 'driver' | 'passenger';
  /** Expo time-to-live in seconds: drop undelivered pushes after this long. */
  ttl?: number;
}

/** Delivery outcome; `invalid` means the provider says this token is dead. */
type DeliveryResult = { ok: boolean; invalid: boolean };

/** Offers expire after 20s server-side; a late push for a dead offer is noise. */
export const OFFER_PUSH_TTL_SECONDS = 30;

const SEND_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 300;

// Expo push tokens look like `ExponentPushToken[...]` (or the legacy
// `ExpoPushToken[...]`). Both apps only ever obtain Expo tokens
// (getExpoPushTokenAsync; no client ever called getDevicePushTokenAsync), so native
// FCM delivery was dead code and was removed. Anything else is undeliverable.
function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/** Push tokens are send credentials: log only a short prefix. */
function maskToken(token: string): string {
  return `${token.slice(0, 22)}…`;
}

// Push is always enabled in production. In development it is off by default so
// we don't spam real devices while iterating; set SEND_PUSH_IN_DEV=true to
// actually deliver (e.g. against a physical device in Expo Go).
function isPushEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.SEND_PUSH_IN_DEV === 'true';
}

// ─── Expo (ExponentPushToken) ──────────────────────────────────────────

async function sendExpoPushOnce(
  token: string,
  message: PushMessage,
): Promise<DeliveryResult & { retry: boolean }> {
  const payload: Record<string, unknown> = {
    to: token,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound?.trim() ? message.sound.trim() : 'default',
    priority: 'high',
    // Matches Android channels in the driver app (notifications.ts).
    channelId: message.channelId ?? 'trip-requests',
  };
  if (typeof message.badge === 'number' && Number.isFinite(message.badge)) {
    payload.badge = Math.max(0, Math.floor(message.badge));
  }
  if (typeof message.ttl === 'number' && Number.isFinite(message.ttl) && message.ttl > 0) {
    payload.ttl = Math.floor(message.ttl);
  }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => null)) as any;

    if (!res.ok) {
      logger.error('[EXPO-PUSH] Send failed', {
        status: res.status,
        token: maskToken(token),
        response: body,
      });
      return { ok: false, invalid: false, retry: res.status === 429 || res.status >= 500 };
    }

    // Expo returns HTTP 200 with a per-message ticket in `data`: an object for a
    // single message, an array for batches. A bad/unregistered token surfaces as
    // `status: 'error'` there, not as a 4xx.
    const ticket = Array.isArray(body?.data) ? body.data[0] : body?.data;
    if (ticket?.status === 'error') {
      const invalid = ticket?.details?.error === 'DeviceNotRegistered';
      logger.error('[EXPO-PUSH] Token rejected by Expo', {
        token: maskToken(token),
        details: ticket,
      });
      return { ok: false, invalid, retry: false };
    }

    logger.info('[EXPO-PUSH] Push sent', {
      status: res.status,
      token: maskToken(token),
      response: body,
    });
    return { ok: true, invalid: false, retry: false };
  } catch (err) {
    logger.error('[EXPO-PUSH] Error', { error: (err as Error).message });
    return { ok: false, invalid: false, retry: true };
  }
}

async function sendExpoPush(token: string, message: PushMessage): Promise<DeliveryResult> {
  const first = await sendExpoPushOnce(token, message);
  if (first.ok || !first.retry) return { ok: first.ok, invalid: first.invalid };
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  const second = await sendExpoPushOnce(token, message);
  return { ok: second.ok, invalid: second.invalid };
}

export async function sendExpoPushNotification(
  token: string,
  message: PushMessage,
): Promise<boolean> {
  return (await sendExpoPush(token, message)).ok;
}

// ─── Dispatcher ────────────────────────────────────────────────────────

async function deliver(token: string, message: PushMessage): Promise<DeliveryResult> {
  if (!isPushEnabled()) {
    logger.info('[PUSH] Push disabled — not sending', {
      nodeEnv: process.env.NODE_ENV ?? 'unset',
      sendPushInDev: process.env.SEND_PUSH_IN_DEV ?? 'unset',
      title: message.title,
    });
    return { ok: false, invalid: false };
  }

  if (isExpoToken(token)) return sendExpoPush(token, message);

  // Not an Expo token: no provider can deliver it, so let the fan-out drop the row.
  logger.warn('[PUSH] Unsupported (non-Expo) token — removing', { token: maskToken(token) });
  return { ok: false, invalid: true };
}

export async function sendPush(token: string, message: PushMessage): Promise<boolean> {
  return (await deliver(token, message)).ok;
}

// ─── Per-user fan-out ──────────────────────────────────────────────────

export type PushToUserResult = {
  ok: boolean;
  tokenCount: number;
  status: 'sent' | 'zero_tokens' | 'failed';
};

export async function sendPushToUserDetailed(
  userId: string,
  message: PushMessage,
): Promise<PushToUserResult> {
  try {
    const { db } = await import('../db/client');
    const { pushTokens } = await import('../db/schema/push-tokens');

    const tokens = await db
      .select({ token: pushTokens.token, platform: pushTokens.platform, app: pushTokens.app })
      .from(pushTokens)
      .where(eq(pushTokens.user_id, userId));

    // Skip PWA/admin web push subscriptions — those use VAPID, not Expo/FCM.
    // Per-app routing: 'legacy' rows (registered before per-app) get everything
    // until the client re-registers with its app.
    const deviceTokens = tokens.filter(
      (t) => t.platform !== 'web' && (!message.app || t.app === message.app || t.app === 'legacy'),
    );

    if (deviceTokens.length === 0) {
      logger.warn('[PUSH] No push tokens for user', {
        userId: userId.slice(0, 8),
        skippedWeb: tokens.length - deviceTokens.length,
      });
      return { ok: false, tokenCount: 0, status: 'zero_tokens' };
    }

    const results = await Promise.allSettled(
      deviceTokens.map(async (t) => {
        logger.info('[PUSH] Sending to token', {
          userId: userId.slice(0, 8),
          platform: t.platform,
          app: t.app,
          token: maskToken(t.token),
        });
        const result = await deliver(t.token, message);
        if (result.invalid) {
          await db
            .delete(pushTokens)
            .where(and(eq(pushTokens.user_id, userId), eq(pushTokens.token, t.token)))
            .catch((err) =>
              logger.error('[PUSH] failed to remove invalid token', {
                error: (err as Error).message,
              }),
            );
        }
        return result.ok;
      }),
    );
    const anySuccess = results.some((r) => r.status === 'fulfilled' && r.value);
    return {
      ok: anySuccess,
      tokenCount: deviceTokens.length,
      status: anySuccess ? 'sent' : 'failed',
    };
  } catch (err) {
    logger.error('[PUSH] sendPushToUser error', { error: (err as Error).message });
    return { ok: false, tokenCount: 0, status: 'failed' };
  }
}

export async function sendPushToUser(userId: string, message: PushMessage): Promise<boolean> {
  const result = await sendPushToUserDetailed(userId, message);
  return result.ok;
}
