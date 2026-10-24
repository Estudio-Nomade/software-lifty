import { exitOnboardingToWelcome } from '../../lib/exitOnboardingToWelcome';

describe('exitOnboardingToWelcome', () => {
  it('calls signOut and returns signed_out on success', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    const clearAuthState = jest.fn();

    const result = await exitOnboardingToWelcome({ signOut, clearAuthState });

    expect(result).toBe('signed_out');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearAuthState).not.toHaveBeenCalled();
  });

  it('clears local auth when signOut throws', async () => {
    const signOut = jest.fn().mockRejectedValue(new Error('network'));
    const clearAuthState = jest.fn();

    const result = await exitOnboardingToWelcome({ signOut, clearAuthState });

    expect(result).toBe('cleared_local');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearAuthState).toHaveBeenCalledTimes(1);
  });

  it('skips when already in flight (double-tap guard)', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    const clearAuthState = jest.fn();

    const result = await exitOnboardingToWelcome(
      { signOut, clearAuthState },
      { inFlight: true },
    );

    expect(result).toBe('skipped');
    expect(signOut).not.toHaveBeenCalled();
    expect(clearAuthState).not.toHaveBeenCalled();
  });
});
