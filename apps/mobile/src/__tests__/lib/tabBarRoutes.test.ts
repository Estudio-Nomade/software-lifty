import {
  TAB_BAR_ROUTES,
  TAB_SCREEN,
  isSameTabRoute,
  isTabBarRoute,
  screenForTab,
  tabKeyFromPathname,
} from '../../lib/tabBarRoutes';

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

describe('tabKeyFromPathname', () => {
  it('maps home-equivalent paths to home', () => {
    expect(tabKeyFromPathname('/')).toBe('home');
    expect(tabKeyFromPathname('/online')).toBe('home');
    expect(tabKeyFromPathname('/active')).toBe('home');
  });

  it('maps each primary tab path', () => {
    expect(tabKeyFromPathname('/earnings')).toBe('earnings');
    expect(tabKeyFromPathname('/trip-history')).toBe('trips');
    expect(tabKeyFromPathname('/profile')).toBe('profile');
    expect(tabKeyFromPathname('/cancellation-policy')).toBe('profile');
  });

  it('returns null for non-tab routes', () => {
    expect(tabKeyFromPathname('/incoming-request')).toBeNull();
    expect(tabKeyFromPathname('/navigation')).toBeNull();
  });
});

describe('isSameTabRoute', () => {
  it('is true when already on that tab (including home equivalents)', () => {
    expect(isSameTabRoute('/active', 'home')).toBe(true);
    expect(isSameTabRoute('/online', 'home')).toBe(true);
    expect(isSameTabRoute('/earnings', 'earnings')).toBe(true);
    expect(isSameTabRoute('/trip-history', 'trips')).toBe(true);
    expect(isSameTabRoute('/profile', 'profile')).toBe(true);
    expect(isSameTabRoute('/cancellation-policy', 'profile')).toBe(true);
  });

  it('is false when switching to a different tab', () => {
    expect(isSameTabRoute('/active', 'earnings')).toBe(false);
    expect(isSameTabRoute('/earnings', 'home')).toBe(false);
    expect(isSameTabRoute('/profile', 'trips')).toBe(false);
  });
});

describe('screenForTab', () => {
  it('returns canonical screens (home → Active)', () => {
    expect(screenForTab('home')).toBe('Active');
    expect(screenForTab('earnings')).toBe('Earnings');
    expect(screenForTab('trips')).toBe('TripHistory');
    expect(screenForTab('profile')).toBe('Profile');
    expect(TAB_SCREEN.home).toBe('Active');
  });
});
