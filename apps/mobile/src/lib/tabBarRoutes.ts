export type TabKey = 'home' | 'earnings' | 'trips' | 'profile';

export const TAB_BAR_ROUTES = [
  '/online',
  '/active',
  '/earnings',
  '/trip-history',
  '/profile',
  '/cancellation-policy',
] as const;

/** Canonical screen names for useAppNavigation (PascalCase). */
export const TAB_SCREEN: Record<TabKey, string> = {
  home: 'Active',
  earnings: 'Earnings',
  trips: 'TripHistory',
  profile: 'Profile',
};

const HOME_PATHS = new Set(['/', '/online', '/active']);
const EARNINGS_PATHS = new Set(['/earnings']);
const TRIPS_PATHS = new Set(['/trip-history']);
const PROFILE_PATHS = new Set(['/profile', '/cancellation-policy']);

export function isTabBarRoute(pathname: string): boolean {
  return (TAB_BAR_ROUTES as readonly string[]).includes(pathname);
}

export function tabKeyFromPathname(pathname: string): TabKey | null {
  if (HOME_PATHS.has(pathname)) return 'home';
  if (EARNINGS_PATHS.has(pathname)) return 'earnings';
  if (TRIPS_PATHS.has(pathname)) return 'trips';
  if (PROFILE_PATHS.has(pathname)) return 'profile';
  return null;
}

export function isSameTabRoute(pathname: string, tab: TabKey): boolean {
  return tabKeyFromPathname(pathname) === tab;
}

export function screenForTab(tab: TabKey): string {
  return TAB_SCREEN[tab];
}
