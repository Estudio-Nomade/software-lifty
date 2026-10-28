import {
  outcomeFromAccessToken,
  shouldApplySessionAfterSettle,
  shouldClearGhostOnRestoreFailure,
} from '../../lib/sessionRestorePolicy';

describe('outcomeFromAccessToken', () => {
  it('clears ghost when Supabase has no access_token', () => {
    expect(outcomeFromAccessToken(null)).toBe('clear_ghost');
    expect(outcomeFromAccessToken(undefined)).toBe('clear_ghost');
    expect(outcomeFromAccessToken('')).toBe('clear_ghost');
  });

  it('applies session when access_token is present', () => {
    expect(outcomeFromAccessToken('eyJhbGciOi...')).toBe('apply_session');
  });
});

describe('shouldClearGhostOnRestoreFailure', () => {
  it('clears on timeout/error if session was never confirmed', () => {
    expect(shouldClearGhostOnRestoreFailure(false)).toBe(true);
  });

  it('does not clear after a confirmed Supabase session', () => {
    expect(shouldClearGhostOnRestoreFailure(true)).toBe(false);
  });
});

describe('shouldApplySessionAfterSettle', () => {
  it('blocks setSession after timeout already settled restore', () => {
    expect(shouldApplySessionAfterSettle(true)).toBe(false);
  });

  it('allows setSession when restore has not settled yet', () => {
    expect(shouldApplySessionAfterSettle(false)).toBe(true);
  });
});
