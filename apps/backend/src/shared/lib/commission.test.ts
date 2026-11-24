process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDb, resetDb } from '../db/client';
import { platformConfig } from '../db/schema';
import {
  COMMISSION_RATE_KEY,
  COMMISSION_RATE_SOFT_CAP,
  DEFAULT_DEBT_CAP_ARS,
  driverBlurbForRate,
  driverTitleForPhase,
  getCommissionConfig,
  getCommissionRate,
  getCommissionScheme,
  getDebtCapArs,
  parseCommissionRate,
} from './commission';

beforeEach(async () => {
  const db = getDb();
  await db.delete(platformConfig);
});

afterAll(() => {
  resetDb();
});

describe('getDebtCapArs', () => {
  test('defaults to 10000 when config missing', async () => {
    expect(DEFAULT_DEBT_CAP_ARS).toBe(10000);
    const db = getDb();
    const cap = await getDebtCapArs(db);
    expect(cap).toBe(10000);
  });

  test('reads platform.debt_cap_ars from config', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'platform.debt_cap_ars', value: '7500' });
    const cap = await getDebtCapArs(db);
    expect(cap).toBe(7500);
  });
});

describe('parseCommissionRate', () => {
  test('missing/empty/invalid → 0', () => {
    expect(parseCommissionRate(null)).toBe(0);
    expect(parseCommissionRate(undefined)).toBe(0);
    expect(parseCommissionRate('')).toBe(0);
    expect(parseCommissionRate('  ')).toBe(0);
    expect(parseCommissionRate('nope')).toBe(0);
    expect(parseCommissionRate('NaN')).toBe(0);
    expect(parseCommissionRate('-0.1')).toBe(0);
  });

  test('parses fractions and soft-caps at 0.30', () => {
    expect(parseCommissionRate('0')).toBe(0);
    expect(parseCommissionRate('0.05')).toBe(0.05);
    expect(parseCommissionRate('0.15')).toBe(0.15);
    expect(parseCommissionRate('0.30')).toBe(0.3);
    expect(parseCommissionRate('0.5')).toBe(COMMISSION_RATE_SOFT_CAP);
    expect(parseCommissionRate('1')).toBe(COMMISSION_RATE_SOFT_CAP);
  });
});

describe('getCommissionRate', () => {
  test('missing row → 0 (launch-safe)', async () => {
    const db = getDb();
    const rate = await getCommissionRate(db);
    expect(rate).toBe(0);
  });

  test('reads "0"', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0' });
    expect(await getCommissionRate(db)).toBe(0);
  });

  test('reads "0.05" → 0.05', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0.05' });
    expect(await getCommissionRate(db)).toBe(0.05);
  });

  test('invalid value → 0', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: 'abc' });
    expect(await getCommissionRate(db)).toBe(0);
  });

  test('soft-caps above 0.30', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0.99' });
    expect(await getCommissionRate(db)).toBe(COMMISSION_RATE_SOFT_CAP);
  });

  test('ignores now parameter (no calendar phases)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0.05' });
    const a = await getCommissionRate(db, new Date('2020-01-01T00:00:00Z'));
    const b = await getCommissionRate(db, new Date('2030-01-01T00:00:00Z'));
    expect(a).toBe(0.05);
    expect(b).toBe(0.05);
  });
});

describe('getCommissionConfig', () => {
  test('flat compatible shape', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0.05' });
    const config = await getCommissionConfig(db);
    expect(config.phase).toBe('Vigente');
    expect(config.currentDay).toBe(1);
    expect(config.rate).toBe(0.05);
    expect(config.phaseDayStart).toBe(1);
    expect(config.phaseDayEnd).toBeNull();
  });

  test('missing rate → 0', async () => {
    const db = getDb();
    const config = await getCommissionConfig(db);
    expect(config.rate).toBe(0);
  });
});

describe('getCommissionScheme', () => {
  test('single current stage, no multi timeline', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0.05' });
    const scheme = await getCommissionScheme(db);

    expect(scheme.current.phase).toBe('Vigente');
    expect(scheme.current.title).toBe('Tu comisión actual');
    expect(scheme.current.rate_pct).toBe(5);
    expect(scheme.current.blurb).toContain('5%');
    expect(scheme.stages).toHaveLength(1);
    expect(scheme.stages[0]?.status).toBe('current');
    expect(scheme.stages[0]?.rate_pct).toBe(5);
    expect(JSON.stringify(scheme)).not.toContain('current_day');
    expect(JSON.stringify(scheme)).not.toContain('day_start');
    expect(scheme.footnote.toLowerCase()).toContain('comisión');
  });

  test('zero-rate current uses keep-100% blurb', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: COMMISSION_RATE_KEY, value: '0' });
    const scheme = await getCommissionScheme(db);
    expect(scheme.current.rate).toBe(0);
    expect(scheme.current.blurb).toBe('Hoy te quedás con el 100% de tus ganancias.');
    expect(scheme.stages).toHaveLength(1);
    expect(scheme.stages[0]?.status).toBe('current');
  });
});

describe('driver copy helpers', () => {
  test('title for flat phase', () => {
    expect(driverTitleForPhase('Vigente')).toBe('Tu comisión actual');
    expect(driverTitleForPhase('flat')).toBe('Tu comisión actual');
    expect(driverTitleForPhase('Custom Ops')).toBe('Custom Ops');
  });

  test('blurb switches at zero rate', () => {
    expect(driverBlurbForRate(0)).toContain('100%');
    expect(driverBlurbForRate(0.05)).toContain('5%');
    expect(driverBlurbForRate(0.05)).toContain('95%');
  });
});
