import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  commissionPhases,
  districts,
  driverDocuments,
  drivers,
  platformConfig,
  users,
  vehicles,
} from '../../shared/db/schema';
import { getCommissionConfig } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { evaluateIdentificationDeadline } from '../../shared/lib/identification-deadline';
import type { AuthUser } from '../../shared/middleware/auth';
import { ensureDriverEnteredReview } from '../drivers/service';
import { notifyDriverApproved, notifyDriverRejected } from './notifications';

function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const NOT_PENDING_QUEUE = new Set(['review', 'approved', 'rejected', 'suspended']);

export const adminService = {
  /**
   * Heal stuck drivers (docs complete, status still pending/step1/…) so ops
   * queue matches product: register+docs → Pendientes → approve → Conductores.
   */
  async reconcilePendingQueue(): Promise<number> {
    const candidates = await db.select({ id: drivers.id, status: drivers.status }).from(drivers);

    let healed = 0;
    for (const row of candidates) {
      if (NOT_PENDING_QUEUE.has(row.status)) continue;
      const ok = await ensureDriverEnteredReview(row.id);
      if (ok) healed += 1;
    }
    return healed;
  },

  async listPending() {
    await this.reconcilePendingQueue();

    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        document_number: users.document_number,
        document_number_last4: users.document_number_last4,
        status: drivers.status,
        kyc_status: users.kyc_status,
        admin_review_status: drivers.admin_review_status,
        identification_status: drivers.identification_status,
        identification_issued_at: drivers.identification_issued_at,
        created_at: drivers.created_at,
        documents_submitted: sql<number>`(SELECT COUNT(*) FROM ${driverDocuments} WHERE ${driverDocuments.driver_id} = ${drivers.id})::int`,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(drivers.status, 'review'))
      .orderBy(drivers.created_at);

    return rows;
  },

  /**
   * Full driver registry for ops (not only pending review).
   * ID operativo preferido: document_number (DNI).
   */
  async listDrivers(opts?: {
    q?: string;
    status?: string;
    identification_status?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const q = opts?.q?.trim();

    const filters = [];
    if (opts?.status) filters.push(eq(drivers.status, opts.status));
    if (opts?.identification_status) {
      filters.push(eq(drivers.identification_status, opts.identification_status));
    }
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      filters.push(
        or(
          ilike(users.full_name, pattern),
          ilike(users.email, pattern),
          ilike(users.phone, pattern),
          ilike(users.document_number, pattern),
          ilike(users.verified_name, pattern),
          sql`cast(${drivers.id} as text) ilike ${pattern}`,
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        verified_name: users.verified_name,
        email: users.email,
        phone: users.phone,
        document_number: users.document_number,
        document_number_last4: users.document_number_last4,
        status: drivers.status,
        kyc_status: users.kyc_status,
        admin_review_status: drivers.admin_review_status,
        identification_status: drivers.identification_status,
        identification_issued_at: drivers.identification_issued_at,
        approved_at: drivers.approved_at,
        admin_reviewed_at: drivers.admin_reviewed_at,
        is_online: drivers.is_online,
        district_id: drivers.district_id,
        district_name: districts.name,
        district_province: districts.province,
        created_at: drivers.created_at,
        total_trips: drivers.total_trips,
        plate: sql<string | null>`(
          SELECT ${vehicles.plate} FROM ${vehicles}
          WHERE ${vehicles.driver_id} = ${drivers.id}
          ORDER BY ${vehicles.created_at} DESC
          LIMIT 1
        )`,
        vehicle_type: sql<string | null>`(
          SELECT ${vehicles.vehicle_type} FROM ${vehicles}
          WHERE ${vehicles.driver_id} = ${drivers.id}
          ORDER BY ${vehicles.created_at} DESC
          LIMIT 1
        )`,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(whereClause)
      .orderBy(desc(drivers.created_at))
      .limit(limit)
      .offset(offset);

    const enriched = rows.map((row) => {
      const identification = evaluateIdentificationDeadline({
        identification_status: row.identification_status,
        approved_at: row.approved_at,
        admin_reviewed_at: row.admin_reviewed_at,
        created_at: row.created_at,
      });
      return {
        ...row,
        /** Ops-facing ID: DNI if known, else last4, else short driver uuid. */
        registry_id:
          row.document_number?.trim() ||
          (row.document_number_last4 ? `****${row.document_number_last4}` : row.id.slice(0, 8)),
        identification_phase: identification.phase,
        identification_blocks_online: identification.blocks_online,
        identification_days_until_pause: identification.days_until_pause,
        identification_days_since_approval: identification.days_since_approval,
        identification_pause_at: identification.pause_at,
      };
    });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(whereClause);

    return { items: enriched, total: count, limit, offset };
  },

  async getDriverDetail(driverId: string) {
    const [driver] = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        status: drivers.status,
        kyc_status: users.kyc_status,
        verified_name: users.verified_name,
        document_number: users.document_number,
        document_number_last4: users.document_number_last4,
        admin_review_status: drivers.admin_review_status,
        admin_reviewed_at: drivers.admin_reviewed_at,
        admin_review_notes: drivers.admin_review_notes,
        identification_status: drivers.identification_status,
        identification_issued_at: drivers.identification_issued_at,
        identification_external_ref: drivers.identification_external_ref,
        approved_at: drivers.approved_at,
        is_online: drivers.is_online,
        district_id: drivers.district_id,
        district_name: districts.name,
        district_province: districts.province,
        created_at: drivers.created_at,
        total_trips: drivers.total_trips,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    const vehicleRows = await db
      .select({
        id: vehicles.id,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        color: vehicles.color,
        plate: vehicles.plate,
        vehicle_type: vehicles.vehicle_type,
        created_at: vehicles.created_at,
      })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id));

    const documentRows = await db
      .select({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        status: driverDocuments.status,
        superseded_at: driverDocuments.superseded_at,
        created_at: driverDocuments.created_at,
      })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id))
      .orderBy(driverDocuments.created_at);

    const identification = evaluateIdentificationDeadline({
      identification_status: driver.identification_status,
      approved_at: driver.approved_at,
      admin_reviewed_at: driver.admin_reviewed_at,
      created_at: driver.created_at,
    });

    return {
      ...driver,
      registry_id:
        driver.document_number?.trim() ||
        (driver.document_number_last4
          ? `****${driver.document_number_last4}`
          : driver.id.slice(0, 8)),
      identification_phase: identification.phase,
      identification_blocks_online: identification.blocks_online,
      identification_days_until_pause: identification.days_until_pause,
      identification_pause_at: identification.pause_at,
      identification_days_since_approval: identification.days_since_approval,
      vehicles: vehicleRows,
      documents: documentRows,
    };
  },

  async reviewDriver(
    adminUser: AuthUser,
    driverId: string,
    action: 'approve' | 'reject',
    notes?: string,
  ) {
    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
        identification_status: drivers.identification_status,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    // Terminal / already decided first (status leaves 'review' after approve/reject).
    if (
      driver.admin_review_status === 'approved' ||
      driver.admin_review_status === 'rejected' ||
      driver.status === 'approved' ||
      driver.status === 'rejected'
    ) {
      throw new AppError(
        `Driver already ${driver.admin_review_status || driver.status}`,
        400,
        'ALREADY_REVIEWED',
      );
    }
    // Only drivers in the review queue can be approved/rejected.
    // admin_review_status defaults to 'pending' at insert — do NOT treat that alone as reviewable.
    if (driver.status !== 'review' || driver.admin_review_status !== 'pending') {
      throw new AppError(
        'El conductor aún no está en cola de review (faltan docs o no reconcilió status)',
        409,
        'NOT_IN_REVIEW_QUEUE',
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date();
    const identificationPatch =
      action === 'approve' && driver.identification_status !== 'issued'
        ? { identification_status: 'pending_pickup' as const }
        : {};

    await db
      .update(drivers)
      .set({
        status: newStatus,
        admin_review_status: newStatus,
        admin_reviewed_by: adminUser.id,
        admin_reviewed_at: now,
        admin_review_notes: notes ?? null,
        documents_pending_review: false,
        ...(action === 'approve' ? { approved_at: now } : {}),
        ...identificationPatch,
        updated_at: now,
      })
      .where(eq(drivers.id, driverId));

    // Resolve the pending documents in line with the admin's decision.
    await db
      .update(driverDocuments)
      .set(action === 'approve' ? { status: 'approved', verified_at: now } : { status: 'rejected' })
      .where(
        and(eq(driverDocuments.driver_id, driverId), eq(driverDocuments.status, 'pending_review')),
      );

    {
      const [driverUser] = await db
        .select({ email: users.email, full_name: users.full_name })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, driverId))
        .limit(1);

      if (driverUser?.email) {
        if (action === 'approve') {
          notifyDriverApproved(driverUser.email, driverUser.full_name ?? 'Driver');
        } else {
          notifyDriverRejected(driverUser.email, driverUser.full_name ?? 'Driver', notes);
        }
      }
    }

    return {
      driver_id: driver.id,
      action,
      status: newStatus,
      message: `Driver ${action === 'approve' ? 'approved' : 'rejected'}`,
    };
  },

  async listCommissionPhases() {
    return db.select().from(commissionPhases).orderBy(commissionPhases.month_start);
  },

  async updateCommissionPhase(id: string, data: Record<string, any>) {
    const [existing] = await db
      .select()
      .from(commissionPhases)
      .where(eq(commissionPhases.id, id))
      .limit(1);

    if (!existing) throw new NotFoundError('Commission phase not found');

    const [updated] = await db
      .update(commissionPhases)
      .set({ ...data, updated_at: new Date() })
      .where(eq(commissionPhases.id, id))
      .returning();

    return updated;
  },

  async getCommissionStartDate() {
    const [row] = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, 'commission_start_date'))
      .limit(1);

    // Align with getCommissionConfig fallback when unset (ops can still PUT a real date).
    return { start_date: row?.value ?? '2026-10-01', configured: Boolean(row) };
  },

  async updateCommissionStartDate(value: string) {
    await db
      .insert(platformConfig)
      .values({ key: 'commission_start_date', value })
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: { value, updated_at: new Date() },
      });

    return { start_date: value };
  },

  async getCurrentCommission() {
    return getCommissionConfig(db);
  },
};
