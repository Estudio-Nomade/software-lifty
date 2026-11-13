process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';
process.env.API_URL = 'https://api.liftyviajes.com/api';
process.env.ADMIN_EMAIL = 'ops-test@lifty.local';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { approveDriver } from './approve';
import { notifyAdminsDriverDocsResubmitted } from './notifications';
import { adminApproveRoute } from './routes';

async function truncate() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
}

const approveApp = new Elysia().group('/api', (a) => a.use(adminApproveRoute));

async function htmlRequest(method: string, path: string) {
  const res = await approveApp.handle(new Request(`http://localhost${path}`, { method }));
  const text = await res.text();
  return { status: res.status, text };
}

beforeAll(async () => {
  resetDb();
});

beforeEach(async () => {
  await truncate();
});

afterAll(async () => {
  await truncate();
});

describe('approveDriver token + professional license', () => {
  test('pending_professional → professional, clear grace, approve docs', async () => {
    const db = getDb();
    const token = 'approve-token-prof-1';
    const graceStart = new Date('2026-01-01T00:00:00.000Z');
    const due = new Date('2026-03-02T00:00:00.000Z');

    const [user] = await db
      .insert(users)
      .values({
        phone: '+5492617000001',
        full_name: 'Prof Pending',
        role: 'driver',
        email: 'prof@example.com',
      })
      .returning({ id: users.id });

    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        status: 'review',
        admin_review_status: 'pending',
        documents_pending_review: true,
        approval_token: token,
        license_category: 'B',
        license_professional_status: 'pending_professional',
        professional_license_grace_started_at: graceStart,
        professional_license_due_at: due,
        identification_status: 'issued',
      })
      .returning({ id: drivers.id });

    await db.insert(vehicles).values({
      driver_id: driver.id,
      vehicle_type: 'car',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
      color: 'Blanco',
      plate: 'PROF01',
    });

    await db.insert(driverDocuments).values({
      driver_id: driver.id,
      doc_type: 'license_front',
      file_url: 'https://example.com/lic-front.jpg',
      status: 'pending_review',
    });

    const result = await approveDriver(token);
    expect(result.message).toContain('aprobado');

    const [row] = await db.select().from(drivers).where(eq(drivers.id, driver.id)).limit(1);
    expect(row.status).toBe('approved');
    expect(row.admin_review_status).toBe('approved');
    expect(row.documents_pending_review).toBe(false);
    expect(row.approval_token).toBeNull();
    expect(row.license_professional_status).toBe('professional');
    expect(row.license_category).toBe('professional');
    expect(row.professional_license_grace_started_at).toBeNull();
    expect(row.professional_license_due_at).toBeNull();

    const docs = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id));
    expect(docs.every((d) => d.status === 'approved')).toBe(true);
  });

  test('non-pending professional status is left unchanged', async () => {
    const db = getDb();
    const token = 'approve-token-plain-1';

    const [user] = await db
      .insert(users)
      .values({
        phone: '+5492617000002',
        full_name: 'Plain Driver',
        role: 'driver',
      })
      .returning({ id: users.id });

    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        status: 'review',
        admin_review_status: 'pending',
        documents_pending_review: true,
        approval_token: token,
        license_professional_status: 'unknown',
        license_category: null,
      })
      .returning({ id: drivers.id });

    await approveDriver(token);

    const [row] = await db.select().from(drivers).where(eq(drivers.id, driver.id)).limit(1);
    expect(row.status).toBe('approved');
    expect(row.license_professional_status).toBe('unknown');
    expect(row.license_category).toBeNull();
  });
});

describe('approval token lifecycle (resubmit + confirm)', () => {
  async function seedReviewDriver(opts?: {
    token?: string | null;
    phone?: string;
  }): Promise<{ driverId: string; userId: string }> {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({
        phone: opts?.phone ?? `+5492617${String(Date.now()).slice(-7)}`,
        full_name: 'Resubmit Driver',
        role: 'driver',
        email: 'resubmit@example.com',
      })
      .returning({ id: users.id });

    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        status: 'review',
        admin_review_status: 'pending',
        documents_pending_review: true,
        approval_token: opts?.token === undefined ? null : opts.token,
        license_category: 'B',
        license_professional_status: 'pending_professional',
      })
      .returning({ id: drivers.id });

    await db.insert(driverDocuments).values({
      driver_id: driver.id,
      doc_type: 'license_front',
      file_url: 'https://example.com/lic-front.jpg',
      status: 'pending_review',
    });

    return { driverId: driver.id, userId: user.id };
  }

  test('two resubmit notifies reuse the same approval_token while in review', async () => {
    const db = getDb();
    const { driverId } = await seedReviewDriver({ token: null });

    await notifyAdminsDriverDocsResubmitted(driverId, { docTypes: ['license_front'] });
    const [afterFirst] = await db
      .select({ approval_token: drivers.approval_token })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterFirst.approval_token).toBeTruthy();
    const tokenA = afterFirst.approval_token;

    await notifyAdminsDriverDocsResubmitted(driverId, { docTypes: ['license_back'] });
    const [afterSecond] = await db
      .select({ approval_token: drivers.approval_token })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterSecond.approval_token).toBe(tokenA);
  });

  test('after approve (token null), next resubmit notify mints a new token', async () => {
    const db = getDb();
    const oldToken = 'old-cycle-token-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const { driverId } = await seedReviewDriver({ token: oldToken });

    await approveDriver(oldToken);
    const [cleared] = await db
      .select({ approval_token: drivers.approval_token, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(cleared.approval_token).toBeNull();
    expect(cleared.status).toBe('approved');

    await db
      .update(drivers)
      .set({
        status: 'review',
        admin_review_status: 'pending',
        documents_pending_review: true,
        approval_token: null,
      })
      .where(eq(drivers.id, driverId));

    await notifyAdminsDriverDocsResubmitted(driverId, { docTypes: ['license_front'] });
    const [minted] = await db
      .select({ approval_token: drivers.approval_token })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(minted.approval_token).toBeTruthy();
    expect(minted.approval_token).not.toBe(oldToken);
  });

  test('GET approve does not consume token; POST approves once', async () => {
    const db = getDb();
    const token = 'confirm-flow-token-1111-2222-3333-444444444444';
    const { driverId } = await seedReviewDriver({ token });

    const get1 = await htmlRequest('GET', `/api/admin/approve?token=${token}`);
    expect(get1.status).toBe(200);
    expect(get1.text).toContain('Confirmar');
    expect(get1.text).not.toContain('Conductor aprobado');

    const [afterGet] = await db
      .select({ approval_token: drivers.approval_token, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterGet.approval_token).toBe(token);
    expect(afterGet.status).toBe('review');

    const get2 = await htmlRequest('GET', `/api/admin/approve?token=${token}`);
    expect(get2.status).toBe(200);
    expect(get2.text).toContain('Confirmar');

    const post = await htmlRequest('POST', `/api/admin/approve?token=${token}`);
    expect(post.status).toBe(200);
    expect(post.text).toContain('Conductor aprobado');

    const [afterPost] = await db
      .select({
        approval_token: drivers.approval_token,
        status: drivers.status,
        license_professional_status: drivers.license_professional_status,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterPost.approval_token).toBeNull();
    expect(afterPost.status).toBe('approved');
    expect(afterPost.license_professional_status).toBe('professional');

    const post2 = await htmlRequest('POST', `/api/admin/approve?token=${token}`);
    expect(post2.status).toBe(404);
    expect(post2.text).toContain('Token de aprobacion invalido o ya usado');
  });

  test('GET with invalid token shows error without approving', async () => {
    const res = await htmlRequest('GET', '/api/admin/approve?token=does-not-exist');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Token de aprobacion invalido o ya usado');
  });
});
