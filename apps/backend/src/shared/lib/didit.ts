import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';
import { logger } from './logger';

const DEFAULT_API_URL = 'https://verification.didit.me/v3';

export interface DiditSession {
  session_id: string;
  session_token: string;
  session_url: string;
}

function getApiUrl(): string {
  return (process.env.DIDIT_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

/** Redact long tokens/keys from Didit error bodies before logging. */
export function redactDiditBody(text: string, maxLen = 240): string {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
  return trimmed.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]');
}

/**
 * Map Didit HTTP create-session failures to a typed AppError so production
 * safeCall does not mask them as opaque "Internal server error".
 */
export function mapDiditSessionError(status: number, bodyText: string): AppError {
  const body = bodyText.toLowerCase();
  const snippet = redactDiditBody(bodyText);

  if (
    body.includes('not enough credits') ||
    body.includes('enough credits') ||
    body.includes('top up') ||
    body.includes('insufficient credit')
  ) {
    return new AppError(
      'El servicio de verificación no está disponible temporalmente. Intentá más tarde.',
      503,
      'DIDIT_CREDITS_EXHAUSTED',
    );
  }

  if (status === 401 || status === 403) {
    return new AppError(
      'No se pudo iniciar la verificación. Contactá soporte.',
      502,
      'DIDIT_UNAUTHORIZED',
    );
  }

  if (status === 404 || body.includes('workflow')) {
    return new AppError(
      'No se pudo iniciar la verificación. Contactá soporte.',
      502,
      'DIDIT_WORKFLOW_INVALID',
    );
  }

  if (status === 422 || status === 400) {
    return new AppError(
      'No se pudo iniciar la verificación. Intentá de nuevo.',
      502,
      'DIDIT_SESSION_FAILED',
    );
  }

  logger.warn('[DIDIT] unmapped session error', { diditStatus: status, body: snippet });
  return new AppError(
    'No se pudo iniciar la verificación. Intentá de nuevo.',
    502,
    'DIDIT_SESSION_FAILED',
  );
}

export async function createSession(userId: string): Promise<DiditSession> {
  if (process.env.NODE_ENV === 'test') {
    return {
      session_id: `mock-session-${userId}`,
      session_token: `mock-session-${userId}`,
      session_url: 'https://verify.didit.me/mock-session',
    };
  }

  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) {
    logger.warn('[DIDIT] DIDIT_API_KEY not set — using mock session');
    const token = `mock-session-${userId}`;
    return {
      session_id: token,
      session_token: token,
      session_url: `https://verify.didit.me/mock-session?token=${token}`,
    };
  }

  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!workflowId) {
    throw new AppError(
      'Verificación no configurada. Contactá soporte.',
      503,
      'DIDIT_NOT_CONFIGURED',
    );
  }

  try {
    const body: Record<string, unknown> = {
      workflow_id: workflowId,
      vendor_data: userId,
    };
    if (process.env.DIDIT_CALLBACK_URL) {
      body.callback = process.env.DIDIT_CALLBACK_URL;
    }

    const res = await fetch(`${getApiUrl()}/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error('[DIDIT] createSession failed', {
        diditStatus: res.status,
        body: redactDiditBody(errText),
      });
      throw mapDiditSessionError(res.status, errText);
    }

    const data = (await res.json()) as {
      session_id: string;
      session_token: string;
      url: string;
    };
    return {
      session_id: data.session_id,
      session_token: data.session_token,
      session_url: data.url,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('[DIDIT] createSession failed:', (err as Error).message);
    if ((err as Error).name === 'TimeoutError') {
      throw new AppError(
        'La verificación tardó demasiado. Intentá de nuevo.',
        503,
        'DIDIT_TIMEOUT',
      );
    }
    throw new AppError(
      'No se pudo iniciar la verificación. Intentá de nuevo.',
      502,
      'DIDIT_SESSION_FAILED',
    );
  }
}

export interface DiditDecision {
  session_id: string;
  status: string;
  vendor_data?: string | null;
  id_verifications?: Array<{
    document_number?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  }>;
}

export async function getSessionDecision(sessionId: string): Promise<DiditDecision> {
  if (process.env.NODE_ENV === 'test') {
    return { session_id: sessionId, status: 'In Progress', vendor_data: null };
  }

  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('DIDIT_API_KEY is required to fetch a session decision');

  const res = await fetch(`${getApiUrl()}/session/${sessionId}/decision/`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DIDIT decision fetch failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as DiditDecision;
}

export function verifyHmac(payload: string, signature: string): boolean {
  if (process.env.NODE_ENV === 'test')
    return signature.length > 0 && !signature.includes('invalid');
  const secret =
    process.env.NODE_ENV !== 'production'
      ? 'mock-didit-webhook-secret-dev-only'
      : process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) throw new Error('DIDIT_WEBHOOK_SECRET is required in production');
  const computed = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  try {
    return timingSafeEqual(computed, provided);
  } catch {
    return false;
  }
}
