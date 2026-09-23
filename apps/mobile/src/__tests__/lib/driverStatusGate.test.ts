import {
  isDriverStatusUnresolved,
  welcomeEntryMode,
} from '../../lib/driverStatusGate';

describe('isDriverStatusUnresolved', () => {
  it('is true when authenticated without status or onboarding step', () => {
    expect(isDriverStatusUnresolved(true, null, null)).toBe(true);
  });

  it('is false for guests', () => {
    expect(isDriverStatusUnresolved(false, null, null)).toBe(false);
  });

  it('is false once driver status is known', () => {
    expect(isDriverStatusUnresolved(true, 'pending', null)).toBe(false);
    expect(isDriverStatusUnresolved(true, 'approved', 'approved')).toBe(false);
  });

  it('is false once onboarding step is known', () => {
    expect(isDriverStatusUnresolved(true, null, 'profile')).toBe(false);
  });
});

describe('welcomeEntryMode', () => {
  it('stays loading until session restore finishes', () => {
    expect(
      welcomeEntryMode({
        authLoading: false,
        sessionRestored: false,
        isAuthenticated: false,
        driverStatus: null,
        onboardingStep: null,
      }),
    ).toBe('loading');
  });

  it('stays loading while auth context is restoring', () => {
    expect(
      welcomeEntryMode({
        authLoading: true,
        sessionRestored: true,
        isAuthenticated: false,
        driverStatus: null,
        onboardingStep: null,
      }),
    ).toBe('loading');
  });

  it('shows guest CTAs when unauthenticated after restore', () => {
    expect(
      welcomeEntryMode({
        authLoading: false,
        sessionRestored: true,
        isAuthenticated: false,
        driverStatus: null,
        onboardingStep: null,
      }),
    ).toBe('guest');
  });

  it('shows recovery when auth yes but status never arrived (no infinite loading)', () => {
    expect(
      welcomeEntryMode({
        authLoading: false,
        sessionRestored: true,
        isAuthenticated: true,
        driverStatus: null,
        onboardingStep: null,
      }),
    ).toBe('recovery');
  });

  it('hands off when authenticated with known route state', () => {
    expect(
      welcomeEntryMode({
        authLoading: false,
        sessionRestored: true,
        isAuthenticated: true,
        driverStatus: 'approved',
        onboardingStep: 'approved',
      }),
    ).toBe('handoff');
  });
});
