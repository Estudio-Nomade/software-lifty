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

/** Survives clearOAuthAttempt so AuthCallback cannot hand off the pre-OAuth user. */
let recentBlockedUserId: string | null = null;
let recentBlockedUntil = 0;
const BLOCKED_USER_TTL_MS = 120_000;

export function beginOAuthAttempt(blockedUserId: string | null = null): string {
  const id = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentAttempt = {
    id,
    startedAt: Date.now(),
    blockedUserId,
    acceptedUserId: null,
  };
  if (blockedUserId) {
    recentBlockedUserId = blockedUserId;
    recentBlockedUntil = Date.now() + BLOCKED_USER_TTL_MS;
  }
  return id;
}

export function markOAuthAttemptSession(session: Session | null | undefined): void {
  if (!currentAttempt || !session?.access_token || !session.user?.id) return;
  currentAttempt.acceptedUserId = session.user.id;
  // Re-picking the same Google account is allowed once exchange proves it.
  if (session.user.id === recentBlockedUserId) {
    recentBlockedUserId = null;
    recentBlockedUntil = 0;
  }
}

export function getCurrentOAuthAttempt(): OAuthAttemptState | null {
  return currentAttempt;
}

export function clearOAuthAttempt(): void {
  currentAttempt = null;
}

/** Pre-OAuth local user — never hand off as success without exchange mark. */
export function isRecentBlockedOAuthUser(userId: string | null | undefined): boolean {
  if (!userId || !recentBlockedUserId) return false;
  if (Date.now() > recentBlockedUntil) return false;
  return userId === recentBlockedUserId;
}

/**
 * Whether AuthCallback may finishOk with this session (no-params / residual path).
 * Rejects the pre-OAuth blocked user unless createSessionFromUrl marked them.
 */
export function canFinishAuthCallbackWithSession(session: Session | null | undefined): boolean {
  if (!session?.access_token || !session.user?.id) return false;
  if (sessionBelongsToFreshOAuthAttempt(session)) return true;
  if (isRecentBlockedOAuthUser(session.user.id)) return false;
  // Active attempt still open: only marked sessions (above). Unmarked = wait for code.
  if (currentAttempt) return false;
  return true;
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

/** Test helper — reset module state. */
export function resetOAuthAttemptStateForTests(): void {
  currentAttempt = null;
  recentBlockedUserId = null;
  recentBlockedUntil = 0;
}
