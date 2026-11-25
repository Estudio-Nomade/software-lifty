import {
  dismissOutOfServiceBanner,
  isOutOfServiceBannerDismissed,
  noteServiceAreaInside,
  resetOutOfServiceBannerDismissState,
  shouldShowOutOfServiceBanner,
} from '../../lib/serviceAreaStatus';

jest.mock('../../api/passenger', () => ({
  getServiceAreaStatus: jest.fn(),
}));

describe('shouldShowOutOfServiceBanner', () => {
  it('shows only when status is explicitly outside', () => {
    expect(shouldShowOutOfServiceBanner(null)).toBe(false);
    expect(shouldShowOutOfServiceBanner(undefined)).toBe(false);
    expect(shouldShowOutOfServiceBanner({ inside: true, markets: [] })).toBe(false);
    expect(shouldShowOutOfServiceBanner({ inside: false, markets: [] })).toBe(true);
  });
});

describe('out-of-service banner dismiss', () => {
  beforeEach(() => {
    resetOutOfServiceBannerDismissState();
  });

  it('keeps dismiss across remount-equivalent reads until fence flips', () => {
    noteServiceAreaInside(false);
    expect(isOutOfServiceBannerDismissed()).toBe(false);

    dismissOutOfServiceBanner();
    expect(isOutOfServiceBannerDismissed()).toBe(true);

    // Same side of the fence — stay dismissed (tab hop / Home remount).
    noteServiceAreaInside(false);
    expect(isOutOfServiceBannerDismissed()).toBe(true);

    // Crossing in → out re-arms so Buscar can warn again.
    noteServiceAreaInside(true);
    expect(isOutOfServiceBannerDismissed()).toBe(false);
    noteServiceAreaInside(false);
    expect(isOutOfServiceBannerDismissed()).toBe(false);
  });
});
