process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  cancelationLog,
  commissionPhases,
  driverFeePayouts,
  drivers,
  platformConfig,
  tripEvents,
  tripMessages,
  trips,
  userBlocks,
  userCancelationMetrics,
  userDebt,
  users,
} from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
import { insertBlock } from './blocks';
import { DEFAULT_CANCELLATION_CONFIG } from './config';
import { setPaymentGateway } from './gateway';
import { recalcPassengerMetrics } from './metrics';
import { cancellationService } from './service';

let app: ReturnType<typeof createApp>;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(cancelationLog);
  await db.delete(driverFeePayouts);
  await db.delete(userDebt);
  await db.delete(userBlocks);
  await db.delete(userCancelationMetrics);
  await db.delete(tripEvents);
  await db.delete(tripMessages);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': `10.0.0.${(testId % 254) + 1}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const data = await res.json();
  return { status: res.status, data };
}

async function registerDriver(): Promise<string> {
  const db = getDb();
  testId++;
  const [user] = await db
    .insert(users)
    .values({ phone: `+549261${String(testId).padStart(6, '0')}`, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  testId++;
  await truncateTables();
  setPaymentGateway({ async chargeFee() { return false; } });
  const db = getDb();
  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', day_start: 1, day_end: 7, base_rate: 0.0 },
    { name: 'Medición', day_start: 8, day_end: 14, base_rate: 0.05 },
    { name: 'Estabilización', day_start: 15, day_end: 120, base_rate: 0.1 },
    { name: 'Crecimiento', day_start: 121, day_end: null, base_rate: 0.1, daily_increment: null, cap_rate: 0.15 },
  ]);
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' });
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('cancellationService', () => {
  test('expireSearchTimeouts cancels stale pending trips', async () => {
    const token = await registerDriver();
    await request('PUT', '/api/drivers/me', { first_name: 'Test Driver', address_line: 'San Martín 100, Villa Dolores, Córdoba', photo_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png' }, token);
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549261000111', full_name: 'Pax', role: 'passenger' })
      .returning({ id: users.id });
    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: passenger.id,
        status: 'pending',
        origin_lat: -31.9,
        origin_lng: -65,
        dest_lat: -31.88,
        dest_lng: -65.02,
        total_fare: 0,
        platform_fee: 0,
        driver_earnings: 0,
        created_at: new Date(Date.now() - 301_000),
        updated_at: new Date(Date.now() - 301_000),
      })
      .returning();

    const n = await cancellationService.expireSearchTimeouts();
    expect(n).toBe(1);
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated.status).toBe('cancelled');
    const [log] = await db.select().from(cancelationLog).where(eq(cancelationLog.trip_id, trip.id));
    expect(log.reason).toBe('auto_timeout');
    expect(log.fee_applied).toBe(0);
  });

  test('pre_asignacion passenger cancel does not count toward cancel rate', async () => {
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549****0222', full_name: 'Pax Rate', role: 'passenger' })
      .returning({ id: users.id });

    for (let i = 0; i < 5; i++) {
      const [trip] = await db
        .insert(trips)
        .values({
          passenger_id: passenger.id,
          status: 'pending',
          origin_lat: -31.9,
          origin_lng: -65,
          dest_lat: -31.88,
          dest_lng: -65.02,
          total_fare: 0,
          platform_fee: 0,
          driver_earnings: 0,
        })
        .returning();
      await cancellationService.cancelByPassenger(
        { id: passenger.id, role: 'passenger' } as never,
        trip.id,
      );
    }

    const snapshot = await recalcPassengerMetrics(passenger.id, DEFAULT_CANCELLATION_CONFIG);
    expect(snapshot.requested).toBe(5);
    expect(snapshot.preAssign).toBe(5);
    expect(snapshot.cancels).toBe(0);
    expect(snapshot.rateBp).toBe(0);

    const [metrics] = await db
      .select()
      .from(userCancelationMetrics)
      .where(eq(userCancelationMetrics.user_id, passenger.id));
    expect(metrics.total_cancelations).toBe(0);
    expect(metrics.pre_assign_cancelations).toBe(5);
    expect(metrics.cancelation_rate_bp).toBe(0);
  });

  test('assertPassengerCanRequest lifts stale rate block when only pre_assign cancels exist', async () => {
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549****0333', full_name: 'Pax Lift', role: 'passenger' })
      .returning({ id: users.id });

    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: passenger.id,
        status: 'pending',
        origin_lat: -31.9,
        origin_lng: -65,
        dest_lat: -31.88,
        dest_lng: -65.02,
        total_fare: 0,
        platform_fee: 0,
        driver_earnings: 0,
      })
      .returning();
    await cancellationService.cancelByPassenger(
      { id: passenger.id, role: 'passenger' } as never,
      trip.id,
    );

    await insertBlock({
      subjectType: 'passenger',
      subjectId: passenger.id,
      kind: 'cancel_rate_72h',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    await insertBlock({
      subjectType: 'passenger',
      subjectId: passenger.id,
      kind: 'cancel_rate_review',
      startsAt: new Date(),
      endsAt: null,
    });

    const gate = await cancellationService.assertPassengerCanRequest(passenger.id);
    expect(gate.debtArs).toBe(0);

    const remaining = await db
      .select()
      .from(userBlocks)
      .where(eq(userBlocks.subject_id, passenger.id));
    // clearBlock sets ends_at=now; none should still be "active" via getActiveBlock
    for (const b of remaining) {
      expect(b.ends_at).not.toBeNull();
      expect(b.ends_at!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });
});
