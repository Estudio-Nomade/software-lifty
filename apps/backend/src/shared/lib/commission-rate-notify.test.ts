process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../db/client';
import { driverAccountMessages, drivers, platformConfig, users } from '../db/schema';
import {
  COMMISSION_RATE_CHANGE_MESSAGE_TYPE,
  clearCommissionRateNotifyClaim,
  commissionRateChangeBody,
  commissionRateChangePush,
  notifyDriversCommissionRateChanged,
} from './commission-rate-notify';
import * as push from './push';

beforeEach(async () => {
  const db = getDb();
  await db.delete(driverAccountMessages);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(platformConfig);
});

afterAll(() => {
  resetDb();
});

describe('commission rate change copy', () => {
  test('body includes pct and Cobros', () => {
    const body = commissionRateChangeBody(0.05);
    expect(body).toContain('5%');
    expect(body).toContain('Cobros');
    expect(body).toContain('no cambia');
  });

  test('push data type and rate_pct', () => {
    const p = commissionRateChangePush(0.05, 'msg-1');
    expect(p.title).toBe('Actualización de tu comisión');
    expect(p.data.type).toBe('driver:commission_rate_change');
    expect(p.data.rate_pct).toBe('5');
    expect(p.data.message_id).toBe('msg-1');
    expect(p.app).toBe('driver');
  });
});

describe('notifyDriversCommissionRateChanged', () => {
  test('inserts one inbox row per approved driver and stamps push', async () => {
    const db = getDb();
    const [u1] = await db
      .insert(users)
      .values({ phone: '+5492619000001', role: 'driver', full_name: 'A' })
      .returning({ id: users.id });
    const [u2] = await db
      .insert(users)
      .values({ phone: '+5492619000002', role: 'driver', full_name: 'B' })
      .returning({ id: users.id });
    const [u3] = await db
      .insert(users)
      .values({ phone: '+5492619000003', role: 'driver', full_name: 'C' })
      .returning({ id: users.id });

    await db.insert(drivers).values([
      { user_id: u1!.id, status: 'approved' },
      { user_id: u2!.id, status: 'approved' },
      { user_id: u3!.id, status: 'step1' },
    ]);

    const spy = spyOn(push, 'sendPushToUserDetailed').mockResolvedValue({
      ok: true,
      tokenCount: 1,
      status: 'sent',
    });

    const result = await notifyDriversCommissionRateChanged(db, 0.05);
    expect(result.skipped).toBe(false);
    expect(result.drivers).toBe(2);
    expect(result.messages).toBe(2);
    expect(result.push_sent).toBe(2);
    expect(spy.mock.calls.length).toBe(2);

    const rows = await db.select().from(driverAccountMessages);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.type === COMMISSION_RATE_CHANGE_MESSAGE_TYPE)).toBe(true);
    expect(rows.every((r) => r.body.includes('5%'))).toBe(true);
    expect(rows.every((r) => r.push_status === 'sent')).toBe(true);

    spy.mockRestore();
  });

  test('second notify same rate is skipped (idempotent claim)', async () => {
    const db = getDb();
    const [u1] = await db
      .insert(users)
      .values({ phone: '+5492619000021', role: 'driver', full_name: 'E' })
      .returning({ id: users.id });
    await db.insert(drivers).values({ user_id: u1!.id, status: 'approved' });

    const spy = spyOn(push, 'sendPushToUserDetailed').mockResolvedValue({
      ok: true,
      tokenCount: 1,
      status: 'sent',
    });

    const first = await notifyDriversCommissionRateChanged(db, 0.05);
    expect(first.skipped).toBe(false);
    expect(first.messages).toBe(1);

    const second = await notifyDriversCommissionRateChanged(db, 0.05);
    expect(second.skipped).toBe(true);
    expect(second.messages).toBe(0);
    expect(spy.mock.calls.length).toBe(1);

    const rows = await db.select().from(driverAccountMessages);
    expect(rows).toHaveLength(1);

    spy.mockRestore();
  });

  test('push failure still keeps inbox row', async () => {
    const db = getDb();
    const [u1] = await db
      .insert(users)
      .values({ phone: '+5492619000011', role: 'driver', full_name: 'D' })
      .returning({ id: users.id });
    await db.insert(drivers).values({ user_id: u1!.id, status: 'approved' });
    await clearCommissionRateNotifyClaim(db);

    const spy = spyOn(push, 'sendPushToUserDetailed').mockRejectedValue(new Error('boom'));

    const result = await notifyDriversCommissionRateChanged(db, 0);
    expect(result.messages).toBe(1);
    expect(result.push_failed).toBe(1);

    const [row] = await db
      .select()
      .from(driverAccountMessages)
      .where(eq(driverAccountMessages.driver_id, (await db.select().from(drivers))[0]!.id));
    expect(row?.type).toBe(COMMISSION_RATE_CHANGE_MESSAGE_TYPE);
    expect(row?.push_status).toBe('failed');
    expect(row?.body).toContain('0%');

    spy.mockRestore();
  });
});
