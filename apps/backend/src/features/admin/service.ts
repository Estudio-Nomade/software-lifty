import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  commissionPhases,
  driverDocuments,
  drivers,
  platformConfig,
  users,
  vehicles,
} from '../../shared/db/schema';
import { getCommissionConfig } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';
import { notifyDriverApproved, notifyDriverRejected } from './notifications';

export const adminService = {
  async listPending() {
    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        status: drivers.status,
        kyc_status: users.kyc_status,
        admin_review_status: drivers.admin_review_status,
        created_at: drivers.created_at,
        documents_submitted: sql<number>`(SELECT COUNT(*) FROM ${driverDocuments} WHERE ${driverDocuments.driver_id} = ${drivers.id})::int`,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(drivers.status, 'review'))
      .orderBy(drivers.created_at);

    return rows;
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
        document_number_last4: users.document_number_last4,
        admin_review_status: drivers.admin_review_status,
        admin_reviewed_at: drivers.admin_reviewed_at,
        admin_review_notes: drivers.admin_review_notes,
        created_at: drivers.created_at,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    const vehicleRows = await db.select().from(vehicles).where(eq(vehicles.driver_id, driver.id));

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

    return {
      ...driver,
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
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    if (driver.admin_review_status !== 'pending') {
      throw new AppError(`Driver already ${driver.admin_review_status}`, 400, 'ALREADY_REVIEWED');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db
      .update(drivers)
      .set({
        status: newStatus,
        admin_review_status: newStatus,
        admin_reviewed_by: adminUser.id,
        admin_reviewed_at: new Date(),
        admin_review_notes: notes ?? null,
        documents_pending_review: false,
        updated_at: new Date(),
      })
      .where(eq(drivers.id, driverId));

    // Resolve the pending documents in line with the admin's decision.
    await db
      .update(driverDocuments)
      .set(
        action === 'approve'
          ? { status: 'approved', verified_at: new Date() }
          : { status: 'rejected' },
      )
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

    if (!row) throw new NotFoundError('commission_start_date not configured');

    return { start_date: row.value };
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
