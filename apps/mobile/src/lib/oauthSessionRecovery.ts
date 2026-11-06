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

/**
 * Pre-OAuth local user id. Survives clearOAuthAttempt.
 * Cleared only on successful exchange mark or explicit release (cancel) —
 * not on wall-clock TTL (slow Google picker must not re-enable stale handoff).
 */
let blockedOAuthUserId: string | null = null;

/**
 * Pre-OAuth `signOut({ scope: 'local' })` is intentional — SIGNED_OUT must not
 * arm Welcome redirect or wipe a session established mid-race.
 */
let oauthLocalSignOutInFlight = false;
let oauthLocalSignOutGraceUntil = 0;

const OAUTH_LOCAL_SIGNOUT_GRACE_MS = 2_500;

export function beginOAuthLocalSignOut(): void {
  oauthLocalSignOutInFlight = true;
  oauthLocalSignOutGraceUntil = 0;
}

export function endOAuthLocalSignOut(): void {
  oauthLocalSignOutInFlight = false;
  oauthLocalSignOutGraceUntil = Date.now() + OAUTH_LOCAL_SIGNOUT_GRACE_MS;
}

export function isOAuthLocalSignOutInFlight(): boolean {
  if (oauthLocalSignOutInFlight) return true;
  if (oauthLocalSignOutGraceUntil > 0 && Date.now() < oauthLocalSignOutGraceUntil) return true;
  return false;
}

export function resolveSignedOutStoreAction(input: {
  oauthAttemptActive: boolean;
  oauthLocalSignOutInFlight: boolean;
  liveSessionExists: boolean;
  storeHasSession?: boolean;
}): 'clearAuthLocal' | 'clearAuth' | 'resync' | 'keepStore' {
  if (input.oauthAttemptActive || input.oauthLocalSignOutInFlight) {
    return 'clearAuthLocal';
  }
  if (input.liveSessionExists) {
    return 'resync';
  }
  if (input.storeHasSession) {
    return 'keepStore';
  }
  return 'clearAuth';
}

export function beginOAuthAttempt(blockedUserId: string | null = null): string {
  const id = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentAttempt = {
    id,
    startedAt: Date.now(),
    blockedUserId,
    acceptedUserId: null,
  };
  blockedOAuthUserId = blockedUserId;
  return id;
}

export function markOAuthAttemptSession(session: Session | null | undefined): void {
  if (!currentAttempt || !session?.access_token || !session.user?.id) return;
  currentAttempt.acceptedUserId = session.user.id;
  blockedOAuthUserId = null;
  oauthLocalSignOutInFlight = false;
  oauthLocalSignOutGraceUntil = 0;
}

export function getCurrentOAuthAttempt(): OAuthAttemptState | null {
  return currentAttempt;
}

export function clearOAuthAttempt(): void {
  currentAttempt = null;
  if (oauthLocalSignOutInFlight) {
    endOAuthLocalSignOut();
  }
}

/** Call on clean cancel/dismiss with no session so residual block does not stick forever. */
export function releaseOAuthBlockedUser(): void {
  blockedOAuthUserId = null;
}

/** Pre-OAuth local user — never hand off / never send as Bearer without exchange mark. */
export function isBlockedOAuthUser(userId: string | null | undefined): boolean {
  if (!userId || !blockedOAuthUserId) return false;
  return userId === blockedOAuthUserId;
}

/** @deprecated use isBlockedOAuthUser */
export function isRecentBlockedOAuthUser(userId: string | null | undefined): boolean {
  return isBlockedOAuthUser(userId);
}

/**
 * Whether AuthCallback may finishOk with this session (no-params / residual path).
 * Rejects the pre-OAuth blocked user unless createSessionFromUrl marked them.
 */
export function canFinishAuthCallbackWithSession(session: Session | null | undefined): boolean {
  if (!session?.access_token || !session.user?.id) return false;
  if (sessionBelongsToFreshOAuthAttempt(session)) return true;
  if (isBlockedOAuthUser(session.user.id)) return false;
  if (currentAttempt) return false;
  return true;
}

/**
 * Bearer for API: never send the pre-OAuth blocked user's JWT.
 * Prefer live session when safe; else store; else null.
 */
export function resolveApiAccessToken(input: {
  storeToken: string | null;
  storeUserId: string | null;
  liveSession: Session | null | undefined;
}): string | null {
  const live = input.liveSession;
  const liveToken = live?.access_token ?? null;
  const liveUserId = live?.user?.id ?? null;

  if (liveToken && liveUserId) {
    if (sessionBelongsToFreshOAuthAttempt(live)) {
      return liveToken;
    }
    if (isBlockedOAuthUser(liveUserId)) {
      if (input.storeToken && input.storeUserId && !isBlockedOAuthUser(input.storeUserId)) {
        return input.storeToken;
      }
      return null;
    }
    return liveToken;
  }

  if (input.storeToken && input.storeUserId && isBlockedOAuthUser(input.storeUserId)) {
    return null;
  }
  return input.storeToken;
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
  return currentAttempt.acceptedUserId === session.user.id;
}

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

export async function shouldTreatAuthCallbackAsSuccess(
  getSession: () => Promise<GetSessionResult>,
): Promise<boolean> {
  const { data } = await getSession();
  return sessionBelongsToFreshOAuthAttempt(data.session);
}

export async function resolveSessionAfterBrowserDismiss(
  getSession: () => Promise<GetSessionResult>,
): Promise<Session | null> {
  if (!currentAttempt) return null;
  const { data } = await getSession();
  if (!sessionBelongsToFreshOAuthAttempt(data.session)) return null;
  return data.session;
}

export function resetOAuthAttemptStateForTests(): void {
  currentAttempt = null;
  blockedOAuthUserId = null;
  oauthLocalSignOutInFlight = false;
  oauthLocalSignOutGraceUntil = 0;
}
