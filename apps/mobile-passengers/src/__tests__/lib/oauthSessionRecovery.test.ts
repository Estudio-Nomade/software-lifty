import type { Session } from '@supabase/supabase-js';
import {
  beginOAuthAttempt,
  clearOAuthAttempt,
  markOAuthAttemptSession,
  resolveSessionAfterAuthError,
  resolveSessionAfterBrowserDismiss,
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
    clearOAuthAttempt();
  });

  it('returns existing session when twin path already signed in for this attempt', async () => {
    beginOAuthAttempt(null);
    const session = stubSession('at', 'user-a');
    markOAuthAttemptSession(session);
    const result = await resolveSessionAfterAuthError(
      new Error('invalid request: code already used'),
      async () => ({ data: { session } }),
    );
    expect(result).toBe(session);
  });

  it('returns fresh session after local clear when twin path left a new user', async () => {
    beginOAuthAttempt('user-b');
    const session = stubSession('at-a', 'user-a');
    const result = await resolveSessionAfterAuthError(
      new Error('invalid request: code already used'),
      async () => ({ data: { session } }),
    );
    expect(result).toBe(session);
  });

  it('rethrows when exchange fails and there is no session', async () => {
    beginOAuthAttempt(null);
    const err = new Error('invalid request: code already used');
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session: null } })),
    ).rejects.toBe(err);
  });

  it('rethrows when error is not twin-path code reuse even if session exists', async () => {
    beginOAuthAttempt(null);
    const err = new Error('network down');
    const session = stubSession();
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
    clearOAuthAttempt();
  });

  it('is true when getSession has access_token for this attempt', async () => {
    beginOAuthAttempt(null);
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: stubSession('at', 'user-a') },
    }));
    expect(ok).toBe(true);
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
});

describe('resolveSessionAfterBrowserDismiss', () => {
  afterEach(() => {
    clearOAuthAttempt();
  });

  it('returns null without exchange when only stale blocked session remains', async () => {
    beginOAuthAttempt('user-b');
    const session = await resolveSessionAfterBrowserDismiss(async () => ({
      data: { session: stubSession('at-b', 'user-b') },
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
