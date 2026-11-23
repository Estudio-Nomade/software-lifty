import { BACK_FALLBACK } from '../../lib/backFallback';
import { TAB_SCREEN } from '../../lib/tabBarRoutes';

describe('BACK_FALLBACK', () => {
  it('sends trip-history back to home tab when stack has no history', () => {
    expect(BACK_FALLBACK['trip-history']).toBe(TAB_SCREEN.home);
    expect(BACK_FALLBACK['trip-history']).toBe('Active');
  });
});
