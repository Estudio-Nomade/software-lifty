import { TAB_BAR_ROUTES, isTabBarRoute } from '../../lib/tabBarRoutes';

describe('isTabBarRoute', () => {
  it('shows the tab bar on authenticated tab screens', () => {
    expect(isTabBarRoute('/online')).toBe(true);
    expect(isTabBarRoute('/active')).toBe(true);
    expect(isTabBarRoute('/earnings')).toBe(true);
    expect(isTabBarRoute('/trip-history')).toBe(true);
    expect(isTabBarRoute('/profile')).toBe(true);
    expect(isTabBarRoute('/cancellation-policy')).toBe(true);
  });

  it('hides the tab bar on public, auth and trip routes', () => {
    const hidden = [
      '/',
      '/register',
      '/login-credentials',
      '/login-phone',
      '/login-otp',
      '/auth',
      '/forgot-password',
      '/terms',
      '/onboarding-step1',
      '/onboarding-step2',
      '/onboarding-vehicle',
      '/kyc-verify',
      '/kyc-webview',
      '/waiting-approval',
      '/under-review',
      '/select-province',
      '/select-district',
      '/district-terms',
      '/incoming-request',
      '/navigation',
      '/waiting-passenger',
      '/trip-in-progress',
      '/trip-complete',
      '/trip-cancelled',
      '/chat',
    ];

    for (const route of hidden) {
      expect(isTabBarRoute(route)).toBe(false);
    }
  });

  it('only exposes the six tab screens', () => {
    expect(TAB_BAR_ROUTES).toHaveLength(6);
  });
});
