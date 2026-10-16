import {
  isAllowedWithoutSession,
  isPostAuthOnboardingRoute,
} from '../../lib/authRouteGate';

describe('authRouteGate', () => {
  it('allows welcome and auth flows without session', () => {
    expect(isAllowedWithoutSession('')).toBe(true);
    expect(isAllowedWithoutSession('register')).toBe(true);
    expect(isAllowedWithoutSession('login-credentials')).toBe(true);
    expect(isAllowedWithoutSession('verify-email')).toBe(true);
    expect(isAllowedWithoutSession('terms')).toBe(true);
    expect(isAllowedWithoutSession('auth-callback')).toBe(true);
  });

  it('blocks ServiceArea / GPS / Home without session', () => {
    expect(isAllowedWithoutSession('service-area')).toBe(false);
    expect(isAllowedWithoutSession('location-permissions')).toBe(false);
    expect(isAllowedWithoutSession('home')).toBe(false);
    expect(isAllowedWithoutSession('profile')).toBe(false);
  });

  it('marks service-area and location-permissions as post-auth onboarding', () => {
    expect(isPostAuthOnboardingRoute('service-area')).toBe(true);
    expect(isPostAuthOnboardingRoute('location-permissions')).toBe(true);
    expect(isPostAuthOnboardingRoute('home')).toBe(false);
  });
});
