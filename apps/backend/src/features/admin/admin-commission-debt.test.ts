process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverCommissionReceipts, drivers, users } from '../../shared/db/schema';
import { setConfig } from '../../shared/lib/commission';
import { createTestToken } from '../../shared/testing/utils';

let app: ReturnType<typeof createApp>;

async function truncateTables() {
  const db = getDb();
  await db.execute(
    sql`TRUNCATE driver_commission_receipts, drivers, users, platform_config CASCADE`,
  );
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

async function createAdmin() {
  const db = getDb();
  const [admin] = await db
    .insert(users)
    .values({ phone: '+5492619999001', role: 'admin', full_name: 'Admin Ops' })
    .returning({ id: users.id });
  return { id: admin.id, token: await createTestToken(admin.id) };
}

async function createDriver(opts?: {
  debt?: number;
  fraud?: boolean;
  online?: boolean;
  phone?: string;
}) {
  const db = getDb();
  const phone = opts?.phone ?? `+549261${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const [user] = await db
    .insert(users)
    .values({
      phone,
      role: 'driver',
      full_name: 'Debt Driver',
      email: `debt-${phone.replace(/\D/g, '')}@example.com`,
    })
    .returning({ id: users.id });
  const [driver] = await db
    .insert(drivers)
    .values({
      user_id: user.id,
      status: 'approved',
      platform_debt: opts?.debt ?? 0,
      commission_fraud_block: opts?.fraud ?? false,
      is_online: opts?.online ?? false,
    })
    .returning({ id: drivers.id });
  const token = await createTestToken(user.id);
  return { userId: user.id, driverId: driver.id, token };
}

async function insertReceipt(
  driverId: string,
  overrides?: Partial<{
    amount_ars: number;
    debt_before_ars: number;
    status: string;
    file_url: string;
    note: string | null;
  }>,
) {
  const db = getDb();
  const [row] = await db
    .insert(driverCommissionReceipts)
    .values({
      driver_id: driverId,
      amount_ars: overrides?.amount_ars ?? 5000,
      debt_before_ars: overrides?.debt_before_ars ?? 5000,
      file_url:
        overrides?.file_url ??
        'https://example.supabase.co/storage/v1/object/public/driver-documents/commission-receipts/x.jpg',
      status: overrides?.status ?? 'pending_review',
      note: overrides?.note ?? null,
    })
    .returning();
  return row;
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Admin commission debt', () => {
  test('GET/PUT payout-account non-admin 403', async () => {
    const { token } = await createDriver();
    const getRes = await request('GET', '/api/admin/commission/payout-account', undefined, token);
    expect(getRes.status).toBe(403);
    const putRes = await request(
      'PUT',
      '/api/admin/commission/payout-account',
      { alias: 'x' },
      token,
    );
    expect(putRes.status).toBe(403);
  });

  test('GET/PUT payout-account happy path', async () => {
    const { token } = await createAdmin();
    const empty = await request('GET', '/api/admin/commission/payout-account', undefined, token);
    expect(empty.status).toBe(200);
    expect(empty.data.alias).toBeNull();
    expect(empty.data.cvu).toBeNull();
    expect(typeof empty.data.debt_cap_ars).toBe('number');

    const put = await request(
      'PUT',
      '/api/admin/commission/payout-account',
      {
        alias: 'lifty.cobros',
        cvu: '0000003100010000000001',
        holder: 'Lifty Viajes SA',
        bank: 'Banco Galicia',
      },
      token,
    );
    expect(put.status).toBe(200);
    expect(put.data.alias).toBe('lifty.cobros');
    expect(put.data.cvu).toBe('0000003100010000000001');
    expect(put.data.holder).toBe('Lifty Viajes SA');
    expect(put.data.bank).toBe('Banco Galicia');

    const get = await request('GET', '/api/admin/commission/payout-account', undefined, token);
    expect(get.status).toBe(200);
    expect(get.data.alias).toBe('lifty.cobros');
  });

  test('list receipts defaults to pending_review + driver filter', async () => {
    const { token } = await createAdmin();
    const d1 = await createDriver({ phone: '+5492611111001' });
    const d2 = await createDriver({ phone: '+5492611111002' });
    const r1 = await insertReceipt(d1.driverId, { debt_before_ars: 4000 });
    await insertReceipt(d1.driverId, { status: 'approved', debt_before_ars: 1000 });
    await insertReceipt(d2.driverId, { debt_before_ars: 9000 });

    const pending = await request('GET', '/api/admin/commission/receipts', undefined, token);
    expect(pending.status).toBe(200);
    expect(pending.data.total).toBe(2);
    expect(pending.data.items.every((i: { status: string }) => i.status === 'pending_review')).toBe(
      true,
    );
    expect(pending.data.items[0].driver_name).toBe('Debt Driver');

    const byDriver = await request(
      'GET',
      `/api/admin/commission/receipts?status=all&driver_id=${d1.driverId}`,
      undefined,
      token,
    );
    expect(byDriver.status).toBe(200);
    expect(byDriver.data.total).toBe(2);
    expect(byDriver.data.items.every((i: { driver_id: string }) => i.driver_id === d1.driverId)).toBe(
      true,
    );
    expect(byDriver.data.items.some((i: { id: string }) => i.id === r1.id)).toBe(true);
  });

  test('approve pending clears fraud_block and is idempotent', async () => {
    const admin = await createAdmin();
    const { driverId } = await createDriver({ debt: 0, fraud: true });
    const receipt = await insertReceipt(driverId, { debt_before_ars: 7500 });

    const first = await request(
      'POST',
      `/api/admin/commission/receipts/${receipt.id}/approve`,
      undefined,
      admin.token,
    );
    expect(first.status).toBe(200);
    expect(first.data.status).toBe('approved');
    expect(first.data.reviewed_by).toBe(admin.id);

    const db = getDb();
    const [drv] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(drv!.commission_fraud_block).toBe(false);
    expect(Number(drv!.platform_debt)).toBe(0);

    // Re-block after a later fraud decision, then re-approve old receipt must NOT clear it.
    await db
      .update(drivers)
      .set({ commission_fraud_block: true })
      .where(eq(drivers.id, driverId));

    const second = await request(
      'POST',
      `/api/admin/commission/receipts/${receipt.id}/approve`,
      undefined,
      admin.token,
    );
    expect(second.status).toBe(200);
    expect(second.data.status).toBe('approved');

    const [drvAfter] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(drvAfter!.commission_fraud_block).toBe(true);
  });

  test('reject-fraud adds debt_before to current debt, sets fraud_block, force offline', async () => {
    const admin = await createAdmin();
    // Accrued after upload cleared debt_before — must not wipe the 1500.
    const { driverId } = await createDriver({ debt: 1500, fraud: false, online: true });
    const receipt = await insertReceipt(driverId, { debt_before_ars: 8200, amount_ars: 8200 });

    const res = await request(
      'POST',
      `/api/admin/commission/receipts/${receipt.id}/reject-fraud`,
      { note: 'Comprobante falso' },
      admin.token,
    );
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('rejected_fraud');
    expect(res.data.note).toBe('Comprobante falso');

    const db = getDb();
    const [drv] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(drv!.commission_fraud_block).toBe(true);
    expect(Number(drv!.platform_debt)).toBe(9700);
    expect(drv!.is_online).toBe(false);
  });

  test('reject-fraud and receipts list non-admin 403', async () => {
    const { token, driverId } = await createDriver();
    const receipt = await insertReceipt(driverId);
    const list = await request('GET', '/api/admin/commission/receipts', undefined, token);
    expect(list.status).toBe(403);
    const reject = await request(
      'POST',
      `/api/admin/commission/receipts/${receipt.id}/reject-fraud`,
      {},
      token,
    );
    expect(reject.status).toBe(403);
  });

  test('clear-commission-fraud endpoint', async () => {
    const admin = await createAdmin();
    const { driverId } = await createDriver({ debt: 0, fraud: true });

    const res = await request(
      'POST',
      `/api/admin/drivers/${driverId}/clear-commission-fraud`,
      undefined,
      admin.token,
    );
    expect(res.status).toBe(200);
    expect(res.data.commission_fraud_block).toBe(false);

    const db = getDb();
    const [drv] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(drv!.commission_fraud_block).toBe(false);
  });

  test('driver detail includes platform_debt and commission_fraud_block', async () => {
    const admin = await createAdmin();
    const { driverId } = await createDriver({ debt: 3333, fraud: true });
    const db = getDb();
    await setConfig(db, 'platform.lifty_payout_alias', 'x');

    const res = await request('GET', `/api/admin/drivers/${driverId}`, undefined, admin.token);
    expect(res.status).toBe(200);
    expect(res.data.platform_debt).toBe(3333);
    expect(res.data.commission_fraud_block).toBe(true);
  });
});
