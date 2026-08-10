process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../db/client';
import { commissionPhases, platformConfig } from '../db/schema';
import { getCommissionRate, getCommissionConfig } from './commission';

beforeEach(async () => {
  const db = getDb();
  await db.delete(commissionPhases);
  await db.delete(platformConfig);

  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.00 },
    { name: 'Medición', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilización', month_start: 3, month_end: 6, base_rate: 0.10 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.10, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
});

afterAll(() => {
  resetDb();
});

describe('getCommissionRate', () => {
  test('throws if start_date not configured', async () => {
    const db = getDb();
    await expect(getCommissionRate(db)).rejects.toThrow('commission_start_date not configured');
  });

  test('returns 0% for month 1 (Lanzamiento)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-10-15'));
    expect(rate).toBe(0);
  });

  test('returns 5% for month 2 (Medición)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-11-10'));
    expect(rate).toBe(0.05);
  });

  test('returns 10% for month 3 (Estabilización)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-12-05'));
    expect(rate).toBe(0.10);
  });

  test('returns 10% for month 7 day 1 (Crecimiento base)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2027-04-01'));
    expect(rate).toBe(0.10);
  });

  test('returns 10.7% for month 8 (Crecimiento +1 increment)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2027-05-01'));
    expect(rate).toBeCloseTo(0.107, 3);
  });

  test('caps at 15% for month 20', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2028-05-01'));
    expect(rate).toBe(0.15);
  });
});
