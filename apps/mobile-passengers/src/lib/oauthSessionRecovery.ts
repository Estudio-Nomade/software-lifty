import type { Session } from '@supabase/supabase-js';

type GetSessionResult = {
  data: { session: Session | null };
};

export type OAuthAttemptState = {
  id: string;
  startedAt: number;
  /**
   * Local session user id present when the attempt started (before local signOut).
   * Informational only — success requires markOAuthAttemptSession proof.
   */
  blockedUserId: string | null;
  /** User id accepted via exchange / twin recovery for this attempt. */
  acceptedUserId: string | null;
};

let currentAttempt: OAuthAttemptState | null = null;

export function beginOAuthAttempt(blockedUserId: string | null = null): string {
  const id = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentAttempt = {
    id,
    startedAt: Date.now(),
    blockedUserId,
    acceptedUserId: null,
  };
  return id;
}

export function markOAuthAttemptSession(session: Session | null | undefined): void {
  if (!currentAttempt || !session?.access_token || !session.user?.id) return;
  currentAttempt.acceptedUserId = session.user.id;
}

export function getCurrentOAuthAttempt(): OAuthAttemptState | null {
  return currentAttempt;
}

export function clearOAuthAttempt(): void {
  currentAttempt = null;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '').toLowerCase();
  }
  return String(error ?? '').toLowerCase();
}

/** Twin-path: PKCE code already consumed by WebBrowser or deep-link leg. */
export function isTwinPathCodeReuseError(error: unknown): boolean {
  const msg = errorMessage(error);
  return (
    msg.includes('code already used') ||
    msg.includes('already been used') ||
    msg.includes('already exchanged') ||
    msg.includes('flow state not found') ||
    (msg.includes('invalid request') && msg.includes('code'))
  );
}

/**
 * Only sessions proven via markOAuthAttemptSession (createSessionFromUrl exchange)
 * count as belonging to this attempt — never an unmarked getSession leftover.
 */
export function sessionBelongsToFreshOAuthAttempt(session: Session | null | undefined): boolean {
  if (!currentAttempt || !session?.access_token || !session.user?.id) return false;
  return currentAttempt.acceptedUserId === session.user.id;
}

/**
 * When PKCE exchange fails because the twin path already consumed the code,
 * treat an existing session as success only if that twin already marked it.
 */
export async function resolveSessionAfterAuthError(
  error: unknown,
  getSession: () => Promise<GetSessionResult>,
): Promise<Session> {
  if (!isTwinPathCodeReuseError(error)) {
    throw error;
  }
  if (!currentAttempt) {
    throw error;
  }
  const { data } = await getSession();
  const session = data.session;
  if (!session?.access_token) throw error;
  if (!sessionBelongsToFreshOAuthAttempt(session)) throw error;
  return session;
}

/** finishErr gate: success only if this attempt already marked a matching session. */
export async function shouldTreatAuthCallbackAsSuccess(
  getSession: () => Promise<GetSessionResult>,
): Promise<boolean> {
  const { data } = await getSession();
  return sessionBelongsToFreshOAuthAttempt(data.session);
}

/**
 * Browser dismiss/cancel: only return a session already marked for this attempt
 * (twin-path exchange), never an unmarked leftover.
 */
export async function resolveSessionAfterBrowserDismiss(
  getSession: () => Promise<GetSessionResult>,
): Promise<Session | null> {
  if (!currentAttempt) return null;
  const { data } = await getSession();
  if (!sessionBelongsToFreshOAuthAttempt(data.session)) return null;
  return data.session;
}
