import type { Session } from '@supabase/supabase-js';
import {
  resolveSessionAfterAuthError,
  shouldTreatAuthCallbackAsSuccess,
} from '../../lib/oauthSessionRecovery';

function stubSession(access_token = 'at'): Session {
  return {
    access_token,
    refresh_token: 'rt',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u1' } as Session['user'],
  };
}

describe('resolveSessionAfterAuthError', () => {
  it('returns existing session when exchange fails but twin path already signed in', async () => {
    const session = stubSession();
    const result = await resolveSessionAfterAuthError(
      new Error('invalid request: code already used'),
      async () => ({ data: { session } }),
    );
    expect(result).toBe(session);
  });

  it('rethrows when exchange fails and there is no session', async () => {
    const err = new Error('invalid request');
    await expect(
      resolveSessionAfterAuthError(err, async () => ({ data: { session: null } })),
    ).rejects.toBe(err);
  });
});

describe('shouldTreatAuthCallbackAsSuccess', () => {
  it('is true when getSession already has access_token after twin exchange', async () => {
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: stubSession() },
    }));
    expect(ok).toBe(true);
  });

  it('is false when there is no session', async () => {
    const ok = await shouldTreatAuthCallbackAsSuccess(async () => ({
      data: { session: null },
    }));
    expect(ok).toBe(false);
  });
});
