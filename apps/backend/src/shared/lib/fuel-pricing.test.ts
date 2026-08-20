process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDb, resetDb } from '../db/client';
import { fuelPriceLog } from '../db/schema';
import { calculateFare } from './fuel-pricing';

async function setFuelPrice(price: number) {
  await getDb().insert(fuelPriceLog).values({ price, updated_by: 'test' });
}

beforeEach(async () => {
  await getDb().delete(fuelPriceLog);
});

afterAll(() => {
  resetDb();
});

describe('calculateFare (fuel-pricing) — undercharge safeguards', () => {
  test('fuel-unchanged fare uses the tiered per-km model (not legacy single-rate)', async () => {
    await setFuelPrice(2100); // reference price -> below threshold -> unchanged

    const fare = await calculateFare({
      vehicle_type: 'car',
      distance_km: 10,
      duration_minutes: 15,
      commission_rate: 0.1,
    });

    // Tiered: base 950 + (6*340 + 4*390) + 15*68 = 950 + 3600 + 1020
    expect(fare.distance_fare).toBe(3600);
    expect(fare.total).toBe(5570);
  });

  test('fuel price increase never reduces the total fare (monotonic)', async () => {
    await setFuelPrice(2100);
    const base = await calculateFare({
      vehicle_type: 'car',
      distance_km: 10,
      duration_minutes: 15,
      commission_rate: 0.1,
    });

    await getDb().delete(fuelPriceLog);
    await setFuelPrice(2226); // +6% above reference -> crosses the 5% threshold

    const inflated = await calculateFare({
      vehicle_type: 'car',
      distance_km: 10,
      duration_minutes: 15,
      commission_rate: 0.1,
    });

    expect(inflated.total).toBeGreaterThanOrEqual(base.total);
  });

  test('commission rate changes the split but never the passenger total', async () => {
    await setFuelPrice(2100);

    const free = await calculateFare({
      vehicle_type: 'car',
      distance_km: 10,
      duration_minutes: 15,
      commission_rate: 0,
    });
    const withCommission = await calculateFare({
      vehicle_type: 'car',
      distance_km: 10,
      duration_minutes: 15,
      commission_rate: 0.2,
    });

    expect(free.total).toBe(withCommission.total);
    expect(withCommission.platform_fee).toBeGreaterThan(free.platform_fee);
    expect(free.platform_fee + free.driver_earnings).toBe(free.total);
    expect(withCommission.platform_fee + withCommission.driver_earnings).toBe(withCommission.total);
  });

  test('minimum fare is enforced for very short trips', async () => {
    await setFuelPrice(2100);

    const fare = await calculateFare({
      vehicle_type: 'car',
      distance_km: 0.5,
      duration_minutes: 1,
      commission_rate: 0.1,
    });

    expect(fare.total).toBe(1890);
  });

  test('rejects non-positive distance or duration (no degenerate fares)', async () => {
    await setFuelPrice(2100);

    await expect(
      calculateFare({ vehicle_type: 'car', distance_km: 0, duration_minutes: 10 }),
    ).rejects.toThrow('Distance must be positive');

    await expect(
      calculateFare({ vehicle_type: 'car', distance_km: -3, duration_minutes: 10 }),
    ).rejects.toThrow('Distance must be positive');

    await expect(
      calculateFare({ vehicle_type: 'car', distance_km: 5, duration_minutes: 0 }),
    ).rejects.toThrow('Duration must be positive');
  });
});
