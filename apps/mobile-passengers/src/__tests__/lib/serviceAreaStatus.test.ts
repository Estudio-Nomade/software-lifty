import { getServiceAreaStatus } from '../../api/passenger';
import {
  clearServiceAreaStatusCache,
  dismissHomeOutOfServiceBanner,
  fetchServiceAreaStatus,
  isHomeOutOfServiceBannerDismissed,
  noteServiceAreaInside,
  resetHomeOutOfServiceBannerSession,
  shouldShowOutOfServiceBanner,
  subscribeHomeOutOfServiceBanner,
} from '../../lib/serviceAreaStatus';

jest.mock('../../api/passenger', () => ({
  getServiceAreaStatus: jest.fn(),
}));

const mockGet = getServiceAreaStatus as unknown as jest.Mock;

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

describe('fetchServiceAreaStatus cache', () => {
  beforeEach(() => {
    clearServiceAreaStatusCache();
    mockGet.mockReset();
  });

  it('TTL cache avoids repeat network; force bypasses for fence re-check', async () => {
    mockGet
      .mockResolvedValueOnce({ inside: false, markets: [] })
      .mockResolvedValueOnce({ inside: true, markets: [{ name: 'VD', slug: 'vd' }] });

    const a = await fetchServiceAreaStatus(-31.94, -65.19);
    const b = await fetchServiceAreaStatus(-31.94, -65.19);
    expect(a?.inside).toBe(false);
    expect(b?.inside).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);

    const c = await fetchServiceAreaStatus(-31.94, -65.19, { force: true });
    expect(c?.inside).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
