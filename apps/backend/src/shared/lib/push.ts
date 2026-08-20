import { eq } from 'drizzle-orm';
import * as jose from 'jose';
import { logger } from './logger';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Expo push tokens look like `ExponentPushToken[...]` (or the legacy
// `ExpoPushToken[...]`). Native FCM tokens are opaque strings that don't match
// this pattern.
function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

// Push is always enabled in production. In development it is off by default so
// we don't spam real devices while iterating; set SEND_PUSH_IN_DEV=true to
// actually deliver (e.g. against a physical device in Expo Go).
function isPushEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.SEND_PUSH_IN_DEV === 'true';
}

// ─── FCM (native token) ────────────────────────────────────────────────

function parseServiceAccount(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const sa = JSON.parse(raw);
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    };
  } catch {
    return null;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const sa = parseServiceAccount();
  if (!sa) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.clientEmail)
    .setSubject(sa.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await jose.importPKCS8(sa.privateKey, 'RS256'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    logger.error('[FCM] Failed to get access token:', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

async function sendFcmPush(token: string, message: PushMessage): Promise<boolean> {
  const sa = parseServiceAccount();
  if (!sa) {
    logger.warn('[FCM] Not configured (missing FCM_SERVICE_ACCOUNT_JSON) — cannot send');
    return false;
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return false;

    const payload: Record<string, unknown> = {
      message: {
        token,
        notification: { title: message.title, body: message.body },
      },
    };
    if (message.data) {
      (payload.message as any).data = message.data;
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const body = (await res.json()) as any;

    if (!res.ok) {
      if (body?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
        logger.warn('[FCM] Token unregistered — remove it from DB', { token });
        return false;
      }
      logger.error('[FCM] Send failed', {
        status: res.status,
        token,
        response: body,
      });
      return false;
    }

    logger.info('[FCM] Push sent', { token, title: message.title, response: body });
    return true;
  } catch (err) {
    logger.error('[FCM] Error', { error: (err as Error).message });
    return false;
  }
}

// ─── Expo (ExponentPushToken) ──────────────────────────────────────────

export async function sendExpoPushNotification(
  token: string,
  message: PushMessage,
): Promise<boolean> {
  const payload = {
    to: token,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: 'default',
    priority: 'high',
    // Matches the Android channel created in the driver app (notifications.ts).
    channelId: 'trip-requests',
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as any;

    if (!res.ok) {
      logger.error('[EXPO-PUSH] Send failed', {
        status: res.status,
        token,
        response: body,
      });
      return false;
    }

    // Expo returns HTTP 200 with a per-receipt status inside `data[]`. A bad or
    // unregistered token surfaces as `status: 'error'` there, not as a 4xx.
    const receipt = body?.data?.[0];
    if (receipt?.status === 'error') {
      logger.error('[EXPO-PUSH] Token rejected by Expo', {
        token,
        details: receipt,
      });
      return false;
    }

    logger.info('[EXPO-PUSH] Push sent', { status: res.status, token, response: body });
    return true;
  } catch (err) {
    logger.error('[EXPO-PUSH] Error', { error: (err as Error).message });
    return false;
  }
}

// ─── Dispatcher ────────────────────────────────────────────────────────

export async function sendPush(token: string, message: PushMessage): Promise<boolean> {
  if (!isPushEnabled()) {
    logger.info('[PUSH] Push disabled — not sending', {
      nodeEnv: process.env.NODE_ENV ?? 'unset',
      sendPushInDev: process.env.SEND_PUSH_IN_DEV ?? 'unset',
      tokenKind: isExpoToken(token) ? 'expo' : 'fcm',
      title: message.title,
    });
    return false;
  }

  if (isExpoToken(token)) {
    logger.info('[PUSH] Routing to Expo Push API', { token });
    return sendExpoPushNotification(token, message);
  }

  logger.info('[PUSH] Routing to FCM', { token });
  return sendFcmPush(token, message);
}

// ─── Per-user fan-out ──────────────────────────────────────────────────

export async function sendPushToUser(userId: string, message: PushMessage): Promise<boolean> {
  try {
    const { db } = await import('../db/client');
    const { pushTokens } = await import('../db/schema/push-tokens');

    const tokens = await db
      .select({ token: pushTokens.token, platform: pushTokens.platform })
      .from(pushTokens)
      .where(eq(pushTokens.user_id, userId));

    if (tokens.length === 0) {
      logger.warn('[PUSH] No push tokens for user', { userId });
      return false;
    }

    let anySuccess = false;
    for (const t of tokens) {
      logger.info('[PUSH] Sending to token', {
        userId,
        platform: t.platform,
        tokenKind: isExpoToken(t.token) ? 'expo' : 'fcm',
      });
      const ok = await sendPush(t.token, message);
      if (ok) anySuccess = true;
    }
    return anySuccess;
  } catch (err) {
    logger.error('[PUSH] sendPushToUser error', { error: (err as Error).message });
    return false;
  }
}
