import {
  AUTHED_KICK_TO_HOME_ROUTES,
  DUAL_USE_ROUTES,
  PUBLIC_ROUTES,
  shouldKickAuthedUserToHome,
} from '../../lib/authRouteGate';

describe('shouldKickAuthedUserToHome', () => {
  it('does not kick authed user from terms (profile read mode)', () => {
    expect(shouldKickAuthedUserToHome('terms')).toBe(false);
  });

  it('kicks authed user from login/register/auth onboarding routes', () => {
    expect(shouldKickAuthedUserToHome('login-credentials')).toBe(true);
    expect(shouldKickAuthedUserToHome('register')).toBe(true);
    expect(shouldKickAuthedUserToHome('auth')).toBe(true);
    expect(shouldKickAuthedUserToHome('login-phone')).toBe(true);
    expect(shouldKickAuthedUserToHome('login-otp')).toBe(true);
  });

  it('kicks authed user from welcome root', () => {
    expect(shouldKickAuthedUserToHome('')).toBe(true);
  });

  it('does not kick protected app routes', () => {
    expect(shouldKickAuthedUserToHome('home')).toBe(false);
    expect(shouldKickAuthedUserToHome('profile')).toBe(false);
  });
});

describe('route lists', () => {
  it('keeps terms public for unauth onboarding', () => {
    expect(PUBLIC_ROUTES).toContain('terms');
  });

  it('marks terms as dual-use and derives kick list without it', () => {
    expect(DUAL_USE_ROUTES).toContain('terms');
    expect(AUTHED_KICK_TO_HOME_ROUTES).not.toContain('terms');
    expect(AUTHED_KICK_TO_HOME_ROUTES).toEqual(
      PUBLIC_ROUTES.filter((r) => r !== 'terms'),
    );
  });
});
