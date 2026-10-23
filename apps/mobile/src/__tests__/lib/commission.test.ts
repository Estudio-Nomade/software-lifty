import {
  formatDebtCapLabel,
  normalizePlatformDebt,
  shouldShowPlatformDebt,
} from '../../lib/commission';

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

describe('normalizePlatformDebt', () => {
  it('falls back to 0 for missing or non-finite values', () => {
    expect(normalizePlatformDebt(undefined)).toBe(0);
    expect(normalizePlatformDebt(Number.NaN)).toBe(0);
  });

  it('returns finite debt amounts', () => {
    expect(normalizePlatformDebt(12500)).toBe(12500);
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
