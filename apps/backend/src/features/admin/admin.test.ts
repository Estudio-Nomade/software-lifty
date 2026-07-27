process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, payoutMethods, users, vehicles, withdrawals } from '../../shared/db/schema';
import { DOC_TYPES } from '../../shared/lib/documents';
import { notifyAdminWithdrawal } from './notifications';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(withdrawals);
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(payoutMethods);
  await db.delete(drivers);
  await db.delete(users);
}

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function createAdminToken(): Promise<string> {
  const db = getDb();
  const [admin] = await db
    .insert(users)
    .values({ phone: '+5492619999999', role: 'admin' })
    .returning({ id: users.id });
  return createTestToken(admin.id);
}

async function createReviewDriver(): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone: '+5492618888888', full_name: 'Test Driver', role: 'driver', kyc_status: 'approved' })
    .returning({ id: users.id });
  const token = await createTestToken(user.id);

  const { data: step1 } = await request('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
  const driverId = step1.id;

  await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));

  await request('PUT', '/api/drivers/me', { vehicle_brand: 'Toyota', vehicle_model: 'Corolla', vehicle_year: 2022, vehicle_color: 'Blanco', vehicle_plate: 'ABC123' }, token);

  for (const doc_type of DOC_TYPES) {
    await request('POST', '/api/drivers/me/documents', { doc_type, file_url: `https://example.com/${doc_type}.pdf` }, token);
  }

  return { token, driverId };
}

async function createWithdrawalScenario(status = 'processing', suffix = '') {
  const db = getDb();

  const [driverUser] = await db
    .insert(users)
    .values({ phone: `+549261777${suffix}777`, full_name: 'Withdrawal Driver', role: 'driver', kyc_status: 'approved' })
    .returning({ id: users.id });

  const [driver] = await db
    .insert(drivers)
    .values({ user_id: driverUser.id, status: 'approved', kyc_status: 'approved', admin_review_status: 'approved' })
    .returning({ id: drivers.id });

  const [payoutMethod] = await db
    .insert(payoutMethods)
    .values({ driver_id: driver.id, method_type: 'mercadopago', account_number: '0000003100088888888888' })
    .returning({ id: payoutMethods.id });

    const [withdrawal] = await db
    .insert(withdrawals)
    .values({ driver_id: driver.id, amount: 1500.75, payout_method_id: payoutMethod.id, status, mp_withdrawal_id: `mp_withdrawal_${suffix}123` })
    .returning({ id: withdrawals.id });

  return { driverUser, driver, payoutMethod, withdrawal };
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

describe('Admin', () => {
  test('GET /drivers/pending without auth returns 401', async () => {
    const { status } = await request('GET', '/api/admin/drivers/pending');
    expect(status).toBe(401);
  });

  test('GET /drivers/pending with non-admin returns 403', async () => {
    const { token } = await createReviewDriver();
    const { status } = await request('GET', '/api/admin/drivers/pending', undefined, token);
    expect(status).toBe(403);
  });

  test('GET /drivers/pending lists drivers in review', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createReviewDriver();

    const { status, data } = await request('GET', '/api/admin/drivers/pending', undefined, adminToken);

    expect(status).toBe(200);
    expect(data).toBeArray();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(driverId);
    expect(data[0].full_name).toBe('Test Driver');
    expect(data[0].status).toBe('review');
    expect(data[0].documents_submitted).toBe(8);
  });

  test('GET /drivers/:id returns full detail', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createReviewDriver();

    const { status, data } = await request('GET', `/api/admin/drivers/${driverId}`, undefined, adminToken);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.full_name).toBe('Test Driver');
    expect(data.kyc_status).toBe('approved');
    expect(data.vehicles).toBeArray();
    expect(data.vehicles.length).toBe(1);
    expect(data.vehicles[0].brand).toBe('Toyota');
    expect(data.documents).toBeArray();
    expect(data.documents.length).toBe(8);
  });

  test('POST /drivers/:id/review approve', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createReviewDriver();

    const { status, data } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'approve', notes: 'All good' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(data.action).toBe('approve');
    expect(data.status).toBe('approved');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.status).toBe('approved');
    expect(driver!.admin_review_status).toBe('approved');
    expect(driver!.admin_review_notes).toBe('All good');
    expect(driver!.admin_reviewed_by).toBeString();
    expect(driver!.admin_reviewed_at).toBeDefined();
  });

  test('POST /drivers/:id/review reject', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createReviewDriver();

    const { status, data } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'reject', notes: 'Invalid license' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(data.action).toBe('reject');
    expect(data.status).toBe('rejected');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.status).toBe('rejected');
    expect(driver!.admin_review_status).toBe('rejected');
    expect(driver!.admin_review_notes).toBe('Invalid license');
  });

  test('POST /drivers/:id/review already reviewed returns error', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createReviewDriver();

    await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'approve' },
      adminToken,
    );

    const { status, data } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'reject' },
      adminToken,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('ALREADY_REVIEWED');
  });

  test('POST /drivers/:id/review non-admin returns 403', async () => {
    const { token, driverId } = await createReviewDriver();

    const { status } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'approve' },
      token,
    );

    expect(status).toBe(403);
  });

  test('notifyAdminWithdrawal sends email to admin recipients', async () => {
    const db = getDb();

    const [driverUser] = await db
      .insert(users)
      .values({ phone: '+5492617777777', full_name: 'Withdrawal Driver', role: 'driver' })
      .returning({ id: users.id });

    const [driver] = await db
      .insert(drivers)
      .values({ user_id: driverUser.id, status: 'approved', kyc_status: 'approved' })
      .returning({ id: drivers.id });

    await db
      .insert(users)
      .values({ phone: '+5492616666666', email: 'admin@lifty.app', role: 'admin' });

    await notifyAdminWithdrawal({
      driverId: driver.id,
      amount: 1500.75,
      withdrawalId: '00000000-0000-0000-0000-000000000001',
      accountNumber: '0000003100088888888888',
    });
  });

  test('notifyAdminWithdrawal handles missing driver gracefully', async () => {
    await notifyAdminWithdrawal({
      driverId: '00000000-0000-0000-0000-000000000099',
      amount: 500,
      withdrawalId: '00000000-0000-0000-0000-000000000002',
      accountNumber: '0000003100011111111111',
    });
  });

  test('notifyAdminWithdrawal handles no admin recipients', async () => {
    const db = getDb();

    const [driverUser] = await db
      .insert(users)
      .values({ phone: '+5492615555555', full_name: 'Solo Driver', role: 'driver' })
      .returning({ id: users.id });

    const [driver] = await db
      .insert(drivers)
      .values({ user_id: driverUser.id, status: 'approved', kyc_status: 'approved' })
      .returning({ id: drivers.id });

    await notifyAdminWithdrawal({
      driverId: driver.id,
      amount: 300,
      withdrawalId: '00000000-0000-0000-0000-000000000003',
      accountNumber: '1234',
    });
  });

  test('GET /withdrawals/pending without auth returns 401', async () => {
    const { status } = await request('GET', '/api/admin/withdrawals/pending');
    expect(status).toBe(401);
  });

  test('GET /withdrawals/pending with non-admin returns 403', async () => {
    const adminToken = await createAdminToken();
    const { withdrawal } = await createWithdrawalScenario();
    // Create a driver token (non-admin)
    const db = getDb();
    const [nonAdmin] = await db
      .insert(users)
      .values({ phone: '+5492616666000', role: 'driver' })
      .returning({ id: users.id });
    const nonAdminToken = createTestToken(nonAdmin.id);

    const { status } = await request('GET', '/api/admin/withdrawals/pending', undefined, nonAdminToken);
    expect(status).toBe(403);
  });

  test('GET /withdrawals/pending lists processing withdrawals', async () => {
    const adminToken = await createAdminToken();
    const { withdrawal } = await createWithdrawalScenario('processing');

    const { status, data } = await request('GET', '/api/admin/withdrawals/pending', undefined, adminToken);

    expect(status).toBe(200);
    expect(data).toBeArray();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(withdrawal.id);
    expect(data[0].amount).toBe(1500.75);
    expect(data[0].status).toBe('processing');
    expect(data[0].driver_name).toBe('Withdrawal Driver');
    expect(data[0].driver_phone).toBe('+549261777777');
    expect(data[0].account_number).toBe('0000003100088888888888');
    expect(data[0].mp_withdrawal_id).toBe('mp_withdrawal_123');
    expect(data[0].created_at).toBeString();
  });

  test('GET /withdrawals/pending status filter works', async () => {
    const adminToken = await createAdminToken();
    await createWithdrawalScenario('processing', 'a');
    await createWithdrawalScenario('completed', 'b');

    const { status, data } = await request(
      'GET',
      '/api/admin/withdrawals/pending?status=completed',
      undefined,
      adminToken,
    );

    expect(status).toBe(200);
    expect(data).toBeArray();
    expect(data.length).toBe(1);
    expect(data[0].status).toBe('completed');
  });

  test('GET /withdrawals/pending date filter works', async () => {
    const adminToken = await createAdminToken();
    
    const db = getDb();
    const [driverUser] = await db
      .insert(users)
      .values({ phone: '+5492618888001', full_name: 'Old Driver', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: driverUser.id, status: 'approved', kyc_status: 'approved', admin_review_status: 'approved' })
      .returning({ id: drivers.id });
    const [pm] = await db
      .insert(payoutMethods)
      .values({ driver_id: driver.id, method_type: 'mercadopago', account_number: '1111' })
      .returning({ id: payoutMethods.id });

    const oldDate = new Date('2024-01-15');
    const recentDate = new Date('2025-06-01');

    await db.insert(withdrawals).values({
      driver_id: driver.id, amount: 100, payout_method_id: pm.id, status: 'completed', created_at: oldDate,
    });
    await db.insert(withdrawals).values({
      driver_id: driver.id, amount: 200, payout_method_id: pm.id, status: 'completed', created_at: recentDate,
    });

    const { status, data } = await request(
      'GET',
      '/api/admin/withdrawals/pending?status=completed&from=2025-01-01&to=2025-12-31',
      undefined,
      adminToken,
    );

    expect(status).toBe(200);
    expect(data).toBeArray();
    expect(data.length).toBe(1);
    expect(data[0].amount).toBe(200);
  });
});
