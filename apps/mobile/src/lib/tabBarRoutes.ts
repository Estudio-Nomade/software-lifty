export const TAB_BAR_ROUTES = [
  '/online',
  '/active',
  '/earnings',
  '/trip-history',
  '/profile',
  '/cancellation-policy',
];

export function isTabBarRoute(pathname: string): boolean {
  return TAB_BAR_ROUTES.includes(pathname);
}
