import { formatDebtCapLabel, shouldShowPlatformDebt } from '../../lib/commission';

describe('shouldShowPlatformDebt', () => {
  it('hides when debt is 0 or missing', () => {
    expect(shouldShowPlatformDebt(undefined)).toBe(false);
    expect(shouldShowPlatformDebt(0)).toBe(false);
  });

  it('shows when platform debt is positive', () => {
    expect(shouldShowPlatformDebt(1500)).toBe(true);
  });

  it('shows when debt_blocks_online even if debt is 0', () => {
    expect(shouldShowPlatformDebt(0, { debtBlocksOnline: true })).toBe(true);
    expect(shouldShowPlatformDebt(undefined, { debtBlocksOnline: true })).toBe(true);
  });
});

describe('formatDebtCapLabel', () => {
  it('returns null for missing or invalid cap', () => {
    expect(formatDebtCapLabel(undefined)).toBeNull();
    expect(formatDebtCapLabel(0)).toBeNull();
  });

  it('formats positive cap without inventing a fixed amount', () => {
    expect(formatDebtCapLabel(10000)).toMatch(/tope \$10[.\s]?000/);
  });
});
