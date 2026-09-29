process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDb, resetDb } from '../db/client';
import { commissionPhases, platformConfig } from '../db/schema';
import { getCommissionRate, getCommissionConfig } from './commission';

const DAY_SEED = [
  { name: 'Lanzamiento', day_start: 1, day_end: 7, base_rate: 0.0 },
  { name: 'Medición', day_start: 8, day_end: 14, base_rate: 0.05 },
  { name: 'Estabilización', day_start: 15, day_end: 120, base_rate: 0.1 },
  {
    name: 'Crecimiento',
    day_start: 121,
    day_end: null,
    base_rate: 0.1,
    daily_increment: 0.0005,
    cap_rate: 0.15,
  },
] as const;

beforeEach(async () => {
  const db = getDb();
  await db.delete(commissionPhases);
  await db.delete(platformConfig);

  await db.insert(commissionPhases).values([...DAY_SEED]);
});

afterAll(() => {
  resetDb();
});

describe('getCommissionRate', () => {
  test('falls back to dev default when start_date not configured', async () => {
    const db = getDb();
    const rate = await getCommissionRate(db);
    expect(typeof rate).toBe('number');
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(0.15);
  });

  test('returns 0% for days 1–7 (Lanzamiento)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-10-01T12:00:00Z'));
    expect(rate).toBe(0);
    const day7 = await getCommissionRate(db, new Date('2026-10-07T12:00:00Z'));
    expect(day7).toBe(0);
  });

  test('returns 5% for day 8 (Medición)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-10-08T12:00:00Z'));
    expect(rate).toBe(0.05);
  });

  test('returns 10% for day 15 (Estabilización)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-10-15T12:00:00Z'));
    expect(rate).toBe(0.1);
  });

  test('returns base for open-ended Crecimiento day 121', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    // 2026-10-01 + 120 days = 2027-01-29 (day 121)
    const rate = await getCommissionRate(db, new Date('2027-01-29T12:00:00Z'));
    expect(rate).toBe(0.1);
  });

  test('applies daily_increment and caps', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    // day 121 + 20 = day 141 → 0.10 + 20*0.0005 = 0.11
    const mid = await getCommissionRate(db, new Date('2027-02-18T12:00:00Z'));
    expect(mid).toBeCloseTo(0.11, 5);
    // far future → cap 0.15
    const capped = await getCommissionRate(db, new Date('2030-01-01T12:00:00Z'));
    expect(capped).toBe(0.15);
  });

  test('before start_date clamps to day 1 / Lanzamiento', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const config = await getCommissionConfig(db, new Date('2026-09-01T12:00:00Z'));
    expect(config.currentDay).toBe(1);
    expect(config.phase).toBe('Lanzamiento');
    expect(config.rate).toBe(0);
  });
});
