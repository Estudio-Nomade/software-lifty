import {
  AUTHED_KICK_TO_HOME_ROUTES,
  DUAL_USE_ROUTES,
  POST_AUTH_FLOW_ROUTES,
  PUBLIC_ROUTES,
  shouldKickAuthedUserToHome,
} from '../../lib/authRouteGate';

describe('shouldKickAuthedUserToHome', () => {
  it('does not kick authed user from terms (profile read mode)', () => {
    expect(shouldKickAuthedUserToHome('terms')).toBe(false);
  });

  it('does not kick post-auth onboarding routes', () => {
    expect(shouldKickAuthedUserToHome('complete-profile')).toBe(false);
    expect(shouldKickAuthedUserToHome('location-permissions')).toBe(false);
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

  it('includes complete-profile as public post-auth flow', () => {
    expect(PUBLIC_ROUTES).toContain('complete-profile');
    expect(POST_AUTH_FLOW_ROUTES).toContain('complete-profile');
    expect(POST_AUTH_FLOW_ROUTES).toContain('location-permissions');
  });

  it('does not mark complete-profile as dual-use', () => {
    expect(DUAL_USE_ROUTES).not.toContain('complete-profile');
  });

  it('marks terms as dual-use and excludes post-auth flow from kick list', () => {
    expect(DUAL_USE_ROUTES).toContain('terms');
    expect(AUTHED_KICK_TO_HOME_ROUTES).not.toContain('terms');
    expect(AUTHED_KICK_TO_HOME_ROUTES).not.toContain('complete-profile');
    expect(AUTHED_KICK_TO_HOME_ROUTES).not.toContain('location-permissions');
    expect(AUTHED_KICK_TO_HOME_ROUTES).toEqual(
      PUBLIC_ROUTES.filter(
        (r) => r !== 'terms' && r !== 'complete-profile' && r !== 'location-permissions',
      ),
    );
  });
});
