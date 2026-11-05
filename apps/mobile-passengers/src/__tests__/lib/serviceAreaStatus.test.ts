import { shouldShowOutOfServiceBanner } from '../../lib/serviceAreaStatus';

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
