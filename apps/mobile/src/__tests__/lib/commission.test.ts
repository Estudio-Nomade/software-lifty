import {
  formatCommissionReceiptDate,
  formatCommissionReceiptStatus,
  formatDebtCapLabel,
  isSafeHttpUrl,
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

describe('formatCommissionReceiptStatus', () => {
  it('maps known statuses to Spanish labels', () => {
    expect(formatCommissionReceiptStatus('pending_review')).toBe('En revisión');
    expect(formatCommissionReceiptStatus('approved')).toBe('Aprobado');
    expect(formatCommissionReceiptStatus('rejected_fraud')).toBe('Rechazado');
  });

  it('falls back for unknown or empty status', () => {
    expect(formatCommissionReceiptStatus('weird')).toBe('Desconocido');
    expect(formatCommissionReceiptStatus('')).toBe('Desconocido');
  });
});

describe('formatCommissionReceiptDate', () => {
  it('returns dash for missing or invalid', () => {
    expect(formatCommissionReceiptDate(undefined)).toBe('—');
    expect(formatCommissionReceiptDate('not-a-date')).toBe('—');
  });

  it('formats ISO dates for es-AR', () => {
    const label = formatCommissionReceiptDate('2026-03-15T18:30:00.000Z');
    expect(label).not.toBe('—');
    expect(label.length).toBeGreaterThan(8);
  });
});

describe('isSafeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeHttpUrl('https://example.com/a.jpg')).toBe(true);
    expect(isSafeHttpUrl('http://example.com/a.pdf')).toBe(true);
  });

  it('rejects empty, non-http schemes, and garbage', () => {
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
  });
});
