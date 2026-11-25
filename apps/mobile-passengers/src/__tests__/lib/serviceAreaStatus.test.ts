import {
  dismissHomeOutOfServiceBanner,
  isHomeOutOfServiceBannerDismissed,
  noteServiceAreaInside,
  resetHomeOutOfServiceBannerSession,
  shouldShowOutOfServiceBanner,
  subscribeHomeOutOfServiceBanner,
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

describe('home out-of-service banner dismiss (session)', () => {
  beforeEach(() => {
    resetHomeOutOfServiceBannerSession();
  });

  it('keeps Home dismiss across remount until logout or fence flip', () => {
    noteServiceAreaInside(false);
    expect(isHomeOutOfServiceBannerDismissed()).toBe(false);

    dismissHomeOutOfServiceBanner();
    expect(isHomeOutOfServiceBannerDismissed()).toBe(true);

    noteServiceAreaInside(false);
    expect(isHomeOutOfServiceBannerDismissed()).toBe(true);

    noteServiceAreaInside(true);
    expect(isHomeOutOfServiceBannerDismissed()).toBe(false);
    noteServiceAreaInside(false);
    expect(isHomeOutOfServiceBannerDismissed()).toBe(false);
  });

  it('resetHomeOutOfServiceBannerSession re-arms after logout', () => {
    noteServiceAreaInside(false);
    dismissHomeOutOfServiceBanner();
    expect(isHomeOutOfServiceBannerDismissed()).toBe(true);

    resetHomeOutOfServiceBannerSession();
    expect(isHomeOutOfServiceBannerDismissed()).toBe(false);
  });

  it('subscribe fires on dismiss and reset so UI can drop local cache', () => {
    const spy = jest.fn();
    const unsub = subscribeHomeOutOfServiceBanner(spy);

    noteServiceAreaInside(false);
    dismissHomeOutOfServiceBanner();
    expect(spy).toHaveBeenCalled();
    spy.mockClear();

    resetHomeOutOfServiceBannerSession();
    expect(spy).toHaveBeenCalled();
    unsub();
  });
});
