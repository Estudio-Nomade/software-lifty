/**
 * Cold-start policy: only trust Supabase session, never persisted isAuthenticated alone.
 * Ghost AsyncStorage auth must be cleared before any /home navigation.
 */

export type SessionRestoreOutcome = 'apply_session' | 'clear_ghost';

/** After getSession resolves: no access_token → wipe local ghost auth. */
export function outcomeFromAccessToken(
  accessToken: string | null | undefined,
): SessionRestoreOutcome {
  return accessToken ? 'apply_session' : 'clear_ghost';
}

/**
 * Timeout / getSession error: clear if we never confirmed a real Supabase session.
 * Avoids leaving rehydrated isAuthenticated=true and routing to Home.
 */
export function shouldClearGhostOnRestoreFailure(sessionConfirmed: boolean): boolean {
  return !sessionConfirmed;
}
