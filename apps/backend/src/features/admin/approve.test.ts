process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { approveDriver } from './approve';

async function truncate() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
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
