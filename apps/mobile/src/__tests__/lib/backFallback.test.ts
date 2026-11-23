import { BACK_FALLBACK } from '../../lib/backFallback';
import { TAB_SCREEN } from '../../lib/tabBarRoutes';

describe('BACK_FALLBACK', () => {
  it('maps trip-history to home tab (Inicio), never Terms', () => {
    expect(BACK_FALLBACK['trip-history']).toBe(TAB_SCREEN.home);
    expect(BACK_FALLBACK['trip-history']).toBe('Active');
    expect(BACK_FALLBACK['trip-history']).not.toBe('Terms');
  });
});
