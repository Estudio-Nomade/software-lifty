import type { Session } from '@supabase/supabase-js';
import {
  beginOAuthAttempt,
  beginOAuthLocalSignOut,
  canFinishAuthCallbackWithSession,
  clearOAuthAttempt,
  getCurrentOAuthAttempt,
  isBlockedOAuthUser,
  isOAuthLocalSignOutInFlight,
  markOAuthAttemptSession,
  releaseOAuthBlockedUser,
  resetOAuthAttemptStateForTests,
  resolveApiAccessToken,
  resolveSessionAfterAuthError,
  resolveSessionAfterBrowserDismiss,
  resolveSignedOutStoreAction,
  shouldTreatAuthCallbackAsSuccess,
} from '../../lib/oauthSessionRecovery';

function stubSession(access_token = 'at', userId = 'u1'): Session {
  return {
    access_token,
    refresh_token: 'rt',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId } as Session['user'],
  };
}

describe('resolveSessionAfterAuthError', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('returns existing session when twin path already marked for this attempt', async () => {
    beginOAuthAttempt(null);
    const session = stubSession('at', 'user-a');
    markOAuthAttemptSession(session);
    const result = await resolveSessionAfterAuthError(
      new Error('invalid request: code already used'),
      async () => ({ data: { session } }),
    );
    expect(result).toBe(session);
  });

  it('rethrows unmarked session even when user id differs from blockedUserId', async () => {
    beginOAuthAttempt('user-b');
    const session = stubSession('at-a', 'user-a');
    const err = new Error('invalid request: code already used');
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session } })),
    ).rejects.toBe(err);
  });

  it('rethrows when exchange fails and there is no session', async () => {
    beginOAuthAttempt(null);
    const err = new Error('invalid request: code already used');
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session: null } })),
    ).rejects.toBe(err);
  });

  it('rethrows when error is not twin-path code reuse even if session is marked', async () => {
    beginOAuthAttempt(null);
    const err = new Error('network down');
    const session = stubSession();
    markOAuthAttemptSession(session);
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session } })),
    ).rejects.toBe(err);
  });

  it('rethrows stale pre-OAuth session without attempt exchange proof', async () => {
    beginOAuthAttempt('user-b');
    const stale = stubSession('at-b', 'user-b');
    const err = new Error('invalid request: code already used');
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session: stale } })),
    ).rejects.toBe(err);
  });

  it('rethrows when there is no fresh OAuth attempt', async () => {
    const err = new Error('invalid request: code already used');
    const session = stubSession();
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session } })),
    ).rejects.toBe(err);
  });
});

describe('shouldTreatAuthCallbackAsSuccess', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('is true only when session user matches mark for this attempt', async () => {
    beginOAuthAttempt(null);
    const session = stubSession('at', 'user-a');
    markOAuthAttemptSession(session);
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session },
    }));
    expect(ok).toBe(true);
  });

  it('is false for unmarked session even with active attempt', async () => {
    beginOAuthAttempt(null);
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: stubSession('at', 'user-a') },
    }));
    expect(ok).toBe(false);
  });

  it('is false when there is no session', async () => {
    beginOAuthAttempt(null);
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: null },
    }));
    expect(ok).toBe(false);
  });

  it('is false for stale blocked user without exchange mark', async () => {
    beginOAuthAttempt('user-b');
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: stubSession('at-b', 'user-b') },
    }));
    expect(ok).toBe(false);
  });

  it('is false when no OAuth attempt is active (stale session alone)', async () => {
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: stubSession() },
    }));
    expect(ok).toBe(false);
  });

  it('is false after clearOAuthAttempt even if session remains', async () => {
    beginOAuthAttempt(null);
    const session = stubSession('at', 'user-a');
    markOAuthAttemptSession(session);
    clearOAuthAttempt();
    expect(getCurrentOAuthAttempt()).toBeNull();
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session },
    }));
    expect(ok).toBe(false);
  });
});

describe('canFinishAuthCallbackWithSession', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('rejects blocked user after attempt cleared without mark (no TTL expiry)', () => {
    beginOAuthAttempt('user-b');
    clearOAuthAttempt();
    expect(isBlockedOAuthUser('user-b')).toBe(true);
    expect(canFinishAuthCallbackWithSession(stubSession('at-b', 'user-b'))).toBe(false);
  });

  it('allows blocked user after releaseOAuthBlockedUser (cancel)', () => {
    beginOAuthAttempt('user-b');
    clearOAuthAttempt();
    releaseOAuthBlockedUser();
    expect(canFinishAuthCallbackWithSession(stubSession('at-b', 'user-b'))).toBe(true);
  });

  it('allows marked session for blocked user after re-pick', () => {
    beginOAuthAttempt('user-b');
    const session = stubSession('at-b', 'user-b');
    markOAuthAttemptSession(session);
    expect(canFinishAuthCallbackWithSession(session)).toBe(true);
    expect(isBlockedOAuthUser('user-b')).toBe(false);
  });

  it('rejects unmarked session while attempt is open', () => {
    beginOAuthAttempt(null);
    expect(canFinishAuthCallbackWithSession(stubSession('at', 'user-a'))).toBe(false);
  });

  it('allows unrelated session when no attempt and no blocked user', () => {
    expect(canFinishAuthCallbackWithSession(stubSession('at', 'user-a'))).toBe(true);
  });
});

describe('resolveApiAccessToken', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('does not send blocked live session JWT during handoff', () => {
    beginOAuthAttempt('user-b');
    clearOAuthAttempt();
    const token = resolveApiAccessToken({
      storeToken: null,
      storeUserId: null,
      liveSession: stubSession('tok-b', 'user-b'),
    });
    expect(token).toBeNull();
  });

  it('prefers marked live session over store', () => {
    beginOAuthAttempt('user-b');
    const live = stubSession('tok-a', 'user-a');
    markOAuthAttemptSession(live);
    const token = resolveApiAccessToken({
      storeToken: 'tok-store',
      storeUserId: 'user-a',
      liveSession: live,
    });
    expect(token).toBe('tok-a');
  });

  it('uses store when live is blocked and store is the new user', () => {
    beginOAuthAttempt('user-b');
    const token = resolveApiAccessToken({
      storeToken: 'tok-a',
      storeUserId: 'user-a',
      liveSession: stubSession('tok-b', 'user-b'),
    });
    expect(token).toBe('tok-a');
  });
});

describe('resolveSessionAfterBrowserDismiss', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('returns null without exchange when only stale blocked session remains', async () => {
    beginOAuthAttempt('user-b');
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: stubSession('at-b', 'user-b') },
    }));
    expect(session).toBeNull();
  });

  it('returns null for unmarked different user (no auto-accept)', async () => {
    beginOAuthAttempt('user-b');
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: stubSession('at-a', 'user-a') },
    }));
    expect(session).toBeNull();
  });

  it('returns null when dismiss has no session', async () => {
    beginOAuthAttempt(null);
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: null },
    }));
    expect(session).toBeNull();
  });

  it('returns twin-path session marked for this attempt', async () => {
    beginOAuthAttempt('user-b');
    const fresh = stubSession('at-a', 'user-a');
    markOAuthAttemptSession(fresh);
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: fresh },
    }));
    expect(session).toBe(fresh);
  });

  it('returns null when no attempt is active', async () => {
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: stubSession() },
    }));
    expect(session).toBeNull();
  });
});

describe('resolveSignedOutStoreAction / oauth local sign-out', () => {
  afterEach(() => {
    resetOAuthAttemptStateForTests();
  });

  it('SIGNED_OUT during OAuth attempt does not choose clearAuth (no needsRedirect)', () => {
    expect(
      resolveSignedOutStoreAction({
        oauthAttemptActive: true,
        oauthLocalSignOutInFlight: false,
        liveSessionExists: false,
      }),
    ).toBe('clearAuthLocal');
  });

  it('SIGNED_OUT during local prep does not choose clearAuth', () => {
    expect(
      resolveSignedOutStoreAction({
        oauthAttemptActive: false,
        oauthLocalSignOutInFlight: true,
        liveSessionExists: false,
      }),
    ).toBe('clearAuthLocal');
  });

  it('stale SIGNED_OUT with live session resyncs', () => {
    expect(
      resolveSignedOutStoreAction({
        oauthAttemptActive: false,
        oauthLocalSignOutInFlight: false,
        liveSessionExists: true,
      }),
    ).toBe('resync');
  });

  it('stale SIGNED_OUT with store session but no live keeps store', () => {
    expect(
      resolveSignedOutStoreAction({
        oauthAttemptActive: false,
        oauthLocalSignOutInFlight: false,
        liveSessionExists: false,
        storeHasSession: true,
      }),
    ).toBe('keepStore');
  });

  it('real SIGNED_OUT clears with redirect path', () => {
    expect(
      resolveSignedOutStoreAction({
        oauthAttemptActive: false,
        oauthLocalSignOutInFlight: false,
        liveSessionExists: false,
      }),
    ).toBe('clearAuth');
  });

  it('beginOAuthLocalSignOut marks in-flight until attempt mark', () => {
    beginOAuthLocalSignOut();
    expect(isOAuthLocalSignOutInFlight()).toBe(true);
    beginOAuthAttempt('u1');
    const session = stubSession('at', 'u2');
    markOAuthAttemptSession(session);
    expect(isOAuthLocalSignOutInFlight()).toBe(false);
  });

  it('clearOAuthAttempt without prior local signOut does not leave grace stuck', () => {
    beginOAuthAttempt(null);
    clearOAuthAttempt();
    expect(isOAuthLocalSignOutInFlight()).toBe(false);
  });
});
