import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from './logger';

const DEFAULT_API_URL = 'https://verification.didit.me/v3';

export interface DiditSession {
  session_id: string;
  session_token: string;
  session_url: string;
}

export type DiditEnv = 'sandbox' | 'live';

/** Which Didit application the configured credentials belong to. Defaults to live. */
export function getDiditEnv(): DiditEnv {
  return process.env.DIDIT_ENV === 'sandbox' ? 'sandbox' : 'live';
}

function getApiUrl(): string {
  return (process.env.DIDIT_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
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
    throw new Error('DIDIT_WORKFLOW_ID is required to create a verification session');
  }

  try {
    const body: Record<string, unknown> = {
      workflow_id: workflowId,
      vendor_data: userId,
    };
    if (process.env.DIDIT_CALLBACK_URL) {
      body.callback = process.env.DIDIT_CALLBACK_URL;
    }
    // Sandbox-only: Didit rejects `sandbox_scenario` on live applications, so it
    // is never sent unless DIDIT_ENV=sandbox.
    if (getDiditEnv() === 'sandbox' && process.env.DIDIT_SANDBOX_SCENARIO) {
      body.sandbox_scenario = process.env.DIDIT_SANDBOX_SCENARIO;
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
      throw new Error(`DIDIT session creation failed: ${res.status} ${errText}`);
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
    logger.error('[DIDIT] createSession failed:', (err as Error).message);
    if ((err as Error).name === 'TimeoutError') {
      throw new Error('DIDIT session creation timed out');
    }
    throw new Error('Failed to create KYC session. Please try again.');
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

/**
 * Didit "V2" canonical JSON: keys sorted recursively, compact separators,
 * Unicode preserved. Whole-valued floats serialise as ints, which JS already
 * does (1.0 === 1), so no extra handling is needed.
 */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function safeHexEqual(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length === 0 || expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export class WebhookSecretMissingError extends Error {
  constructor() {
    super('DIDIT_WEBHOOK_SECRET is not configured');
    this.name = 'WebhookSecretMissingError';
  }
}

/**
 * Verifies a Didit webhook. Tries X-Signature-V2 (canonical JSON, middleware
 * safe) first, then X-Signature (raw body). X-Signature-Simple is deprecated
 * and does not authenticate the payload, so it is intentionally not accepted.
 * Throws WebhookSecretMissingError when no secret is configured (except in the
 * test env, which keeps the legacy "any non-empty, non-invalid" shortcut).
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  parsedBody: unknown;
  headers: Headers;
}): boolean {
  const { rawBody, parsedBody, headers } = input;
  const secret = process.env.DIDIT_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'test') {
      const sig =
        headers.get('X-Signature-V2') ||
        headers.get('X-Signature') ||
        headers.get('X-Didit-Signature') ||
        '';
      return sig.length > 0 && !sig.includes('invalid');
    }
    throw new WebhookSecretMissingError();
  }

  const hmac = (data: string) => createHmac('sha256', secret).update(data).digest('hex');

  try {
    const v2 = headers.get('X-Signature-V2');
    if (v2 && safeHexEqual(hmac(canonicalize(parsedBody)), v2)) return true;

    const raw = headers.get('X-Signature') || headers.get('X-Didit-Signature');
    if (raw && safeHexEqual(hmac(rawBody), raw)) return true;
  } catch {
    return false;
  }
  return false;
}
