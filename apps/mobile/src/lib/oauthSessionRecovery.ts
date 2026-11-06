import type { Session } from '@supabase/supabase-js';

type GetSessionResult = {
  data: { session: Session | null };
};

export type OAuthAttemptState = {
  id: string;
  startedAt: number;
  /**
   * Local session user id present when the attempt started (before local signOut).
   * Must never be treated as OAuth success unless createSessionFromUrl marked it.
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

export function sessionBelongsToFreshOAuthAttempt(session: Session | null | undefined): boolean {
  if (!currentAttempt || !session?.access_token || !session.user?.id) return false;
  if (currentAttempt.acceptedUserId === session.user.id) return true;
  // Stale pre-OAuth identity without exchange proof — never success.
  if (currentAttempt.blockedUserId && session.user.id === currentAttempt.blockedUserId) {
    return false;
  }
  return true;
}

/**
 * When PKCE exchange fails because the twin path already consumed the code,
 * treat an existing session as success only if it belongs to this OAuth attempt.
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
  markOAuthAttemptSession(session);
  return session;
}

/** finishErr gate: do not bounce to login if this attempt already has a fresh session. */
export async function shouldTreatAuthCallbackAsSuccess(
  getSession: () => Promise<GetSessionResult>,
): Promise<boolean> {
  const { data } = await getSession();
  if (!sessionBelongsToFreshOAuthAttempt(data.session)) return false;
  markOAuthAttemptSession(data.session);
  return true;
}

/**
 * Browser dismiss/cancel: only return a session proven for this OAuth attempt
 * (twin-path exchange), never a leftover local session from another account.
 */
export async function resolveSessionAfterBrowserDismiss(
  getSession: () => Promise<GetSessionResult>,
): Promise<Session | null> {
  if (!currentAttempt) return null;
  const { data } = await getSession();
  if (!sessionBelongsToFreshOAuthAttempt(data.session)) return null;
  markOAuthAttemptSession(data.session);
  return data.session;
}
