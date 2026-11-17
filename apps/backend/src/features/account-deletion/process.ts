import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  accountDeletionRequests,
  cancelationLog,
  driverAccountMessages,
  driverCommissionReceipts,
  driverDocuments,
  driverFeePayouts,
  driverLocations,
  driverTvfMetrics,
  drivers,
  passengerProfiles,
  payoutMethods,
  pushTokens,
  ratings,
  sosEvents,
  tripEvents,
  tripMessages,
  trips,
  userBlocks,
  userCancelationMetrics,
  userDebt,
  users,
  vehicles,
} from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import { AppError, ConflictError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { deleteFile, extractStoragePath } from '../../shared/lib/storage';
import { getSupabaseAdminClient } from '../../shared/lib/supabase-admin';
import {
  ACTIVE_TRIP_STATUSES,
  canStartProcessing,
  isStaffRole,
  isStaleProcessingLock,
  processingStaleLockMs,
  wipeScopeForRoles,
} from './policy';

export type ProcessDeps = {
  deleteAuthUser?: (authUserId: string) => Promise<void>;
  deleteStoragePath?: (path: string) => Promise<void>;
  sendCompletionEmail?: (email: string) => Promise<void>;
  now?: () => Date;
};

async function defaultDeleteAuthUser(authUserId: string): Promise<void> {
  const client = getSupabaseAdminClient();
  const { error } = await client.auth.admin.deleteUser(authUserId);
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('not found') || msg.includes('user not found')) return;
    throw new AppError(`Auth delete failed: ${error.message}`, 502, 'AUTH_DELETE_FAILED');
  }
}

async function defaultCompletionEmail(email: string): Promise<void> {
  await sendEmail(
    email,
    'Lifty — cuenta eliminada',
    `<p>Tu solicitud de eliminación de cuenta se completó.</p>
<p>Borramos tus datos personales de la app. Parte de la información operativa
(viajes, montos, comprobantes contables) puede conservarse anonimizada por
obligaciones legales o antifraude.</p>
<p>Si no pediste esto, escribinos a admin@liftyviajes.com.</p>`,
  );
}

async function forceCancelActiveTrips(userId: string, driverId: string | null, now: Date) {
  const passengerActive = await db
    .select({ id: trips.id, status: trips.status })
    .from(trips)
    .where(and(eq(trips.passenger_id, userId), inArray(trips.status, [...ACTIVE_TRIP_STATUSES])));

  const driverActive =
    driverId != null
      ? await db
          .select({ id: trips.id, status: trips.status })
          .from(trips)
          .where(
            and(eq(trips.driver_id, driverId), inArray(trips.status, [...ACTIVE_TRIP_STATUSES])),
          )
      : [];

  const seen = new Set<string>();
  const all = [...passengerActive, ...driverActive].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  for (const trip of all) {
    await db
      .update(trips)
      .set({ status: 'cancelled', updated_at: now })
      .where(eq(trips.id, trip.id));

    await db.insert(tripEvents).values({
      trip_id: trip.id,
      from_status: trip.status,
      to_status: 'cancelled',
      changed_at: now,
    });
  }

  return all.map((t) => t.id);
}

async function anonymizeTripsAndContent(userId: string, driverId: string | null) {
  await db
    .update(tripMessages)
    .set({ text: '[eliminado]' })
    .where(eq(tripMessages.sender_id, userId));

  await db
    .update(ratings)
    .set({ comment: null, tags: null })
    .where(or(eq(ratings.rater_id, userId), eq(ratings.ratee_id, userId)));
  await db.delete(ratings).where(or(eq(ratings.rater_id, userId), eq(ratings.ratee_id, userId)));

  await db.update(sosEvents).set({ description: null }).where(eq(sosEvents.user_id, userId));
  await db.delete(sosEvents).where(eq(sosEvents.user_id, userId));

  // sender_id is NOT NULL + restrict — remove rows after scrub
  await db.delete(tripMessages).where(eq(tripMessages.sender_id, userId));

  await db.update(trips).set({ passenger_id: null }).where(eq(trips.passenger_id, userId));

  if (driverId) {
    await db.update(trips).set({ driver_id: null }).where(eq(trips.driver_id, driverId));
  }

  await db
    .update(cancelationLog)
    .set({ user_id: '00000000-0000-0000-0000-000000000000' })
    .where(eq(cancelationLog.user_id, userId));
}

async function clearReviewerFks(userId: string) {
  await db
    .update(drivers)
    .set({ admin_reviewed_by: null })
    .where(eq(drivers.admin_reviewed_by, userId));
  await db
    .update(driverDocuments)
    .set({ ops_reviewed_by: null })
    .where(eq(driverDocuments.ops_reviewed_by, userId));
  await db
    .update(driverAccountMessages)
    .set({ author_admin_user_id: null })
    .where(eq(driverAccountMessages.author_admin_user_id, userId));
  await db
    .update(driverCommissionReceipts)
    .set({ reviewed_by: null })
    .where(eq(driverCommissionReceipts.reviewed_by, userId));
}

async function deleteStorageForDriver(
  driverId: string,
  avatarUrl: string | null,
  deleteStoragePath: (path: string) => Promise<void>,
) {
  const docs = await db
    .select({ file_url: driverDocuments.file_url })
    .from(driverDocuments)
    .where(eq(driverDocuments.driver_id, driverId));

  for (const doc of docs) {
    const path = extractStoragePath(doc.file_url);
    if (!path) continue;
    try {
      await deleteStoragePath(path);
    } catch (err) {
      logger.warn('[account-deletion] storage doc delete failed', {
        path,
        message: (err as Error).message,
      });
    }
  }

  const receipts = await db
    .select({ file_url: driverCommissionReceipts.file_url })
    .from(driverCommissionReceipts)
    .where(eq(driverCommissionReceipts.driver_id, driverId));

  for (const r of receipts) {
    const path = extractStoragePath(r.file_url);
    if (!path) continue;
    try {
      await deleteStoragePath(path);
    } catch (err) {
      logger.warn('[account-deletion] storage receipt delete failed', {
        path,
        message: (err as Error).message,
      });
    }
  }

  const avatarPath = extractStoragePath(avatarUrl);
  if (avatarPath) {
    try {
      await deleteStoragePath(avatarPath);
    } catch (err) {
      logger.warn('[account-deletion] storage avatar delete failed', {
        path: avatarPath,
        message: (err as Error).message,
      });
    }
  }
}

async function snapshotAccounting(userId: string, driverId: string | null) {
  const note: Record<string, unknown> = {};

  const [debt] = await db.select().from(userDebt).where(eq(userDebt.user_id, userId)).limit(1);
  if (debt) {
    note.user_debt = {
      amount_ars: debt.amount_ars,
      status: debt.status,
      retained: true,
    };
  }

  if (driverId) {
    const receipts = await db
      .select({
        id: driverCommissionReceipts.id,
        amount_ars: driverCommissionReceipts.amount_ars,
        status: driverCommissionReceipts.status,
      })
      .from(driverCommissionReceipts)
      .where(eq(driverCommissionReceipts.driver_id, driverId));
    if (receipts.length) {
      note.driver_commission_receipts = {
        count: receipts.length,
        items: receipts,
        note: 'snapshotted_before_cascade_delete',
      };
    }

    const payouts = await db
      .select({
        id: driverFeePayouts.id,
        amount_ars: driverFeePayouts.amount_ars,
        status: driverFeePayouts.status,
      })
      .from(driverFeePayouts)
      .where(eq(driverFeePayouts.driver_id, driverId));
    if (payouts.length) {
      note.driver_fee_payouts = {
        count: payouts.length,
        items: payouts,
        note: 'orphaned_driver_id_retained_in_table',
      };
    }
  }

  return note;
}

async function deleteDriverGraph(driverId: string) {
  await db.delete(driverLocations).where(eq(driverLocations.driver_id, driverId));
  await db.delete(payoutMethods).where(eq(payoutMethods.driver_id, driverId));
  await db.delete(driverAccountMessages).where(eq(driverAccountMessages.driver_id, driverId));
  await db.delete(driverDocuments).where(eq(driverDocuments.driver_id, driverId));
  await db.delete(vehicles).where(eq(vehicles.driver_id, driverId));
  await db.delete(driverTvfMetrics).where(eq(driverTvfMetrics.driver_id, driverId));
  // commission receipts cascade with drivers — already snapshotted
  await db.delete(drivers).where(eq(drivers.id, driverId));
}

/**
 * Idempotent processor for a single account_deletion_requests row.
 */
export async function processAccountDeletion(
  requestId: string,
  deps: ProcessDeps = {},
): Promise<{ request_id: string; status: string }> {
  const now = deps.now?.() ?? new Date();
  const deleteAuthUser = deps.deleteAuthUser ?? defaultDeleteAuthUser;
  const deleteStoragePath = deps.deleteStoragePath ?? deleteFile;
  const sendCompletionEmail = deps.sendCompletionEmail ?? defaultCompletionEmail;

  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);

  if (!row) throw new NotFoundError('Deletion request not found');

  if (row.status === 'completed') {
    return { request_id: row.id, status: 'completed' };
  }

  if (
    row.status === 'processing' &&
    !isStaleProcessingLock(row.status, row.processing_started_at, now)
  ) {
    // Fresh lock held by another worker — do not steal.
    return { request_id: row.id, status: 'processing' };
  }

  if (
    !canStartProcessing(row.status, {
      processingStartedAt: row.processing_started_at,
      now,
    })
  ) {
    throw new ConflictError(`Cannot process request in status=${row.status}`);
  }

  const staleCutoff = new Date(now.getTime() - processingStaleLockMs());
  const locked = await db
    .update(accountDeletionRequests)
    .set({
      status: 'processing',
      processing_started_at: now,
      updated_at: now,
      error_details: null,
    })
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        or(
          inArray(accountDeletionRequests.status, ['requested', 'failed']),
          and(
            eq(accountDeletionRequests.status, 'processing'),
            or(
              isNull(accountDeletionRequests.processing_started_at),
              lt(accountDeletionRequests.processing_started_at, staleCutoff),
            ),
          ),
        ),
      ),
    )
    .returning();

  if (locked.length === 0) {
    const [again] = await db
      .select({ status: accountDeletionRequests.status })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, requestId))
      .limit(1);
    return { request_id: requestId, status: again?.status ?? 'processing' };
  }

  const email = row.email_normalized;
  const retention: Record<string, unknown> = {
    policy_version: 'v1',
    ...(typeof row.retention_details === 'object' && row.retention_details
      ? row.retention_details
      : {}),
  };

  try {
    const userId = row.user_id;
    if (!userId) {
      throw new AppError('Deletion request missing user_id', 400, 'MISSING_USER');
    }

    const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRow && isStaffRole(userRow.role)) {
      await db
        .update(accountDeletionRequests)
        .set({
          status: 'rejected',
          error_details: 'staff_role',
          updated_at: now,
          retention_details: { ...retention, rejected: 'staff' },
        })
        .where(eq(accountDeletionRequests.id, requestId));
      throw new AppError('Staff accounts cannot be deleted via this flow', 403, 'STAFF_FORBIDDEN');
    }

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, userId))
      .limit(1);
    const [passenger] = await db
      .select({ id: passengerProfiles.id })
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, userId))
      .limit(1);

    const scope = wipeScopeForRoles({
      hasPassenger: Boolean(passenger),
      hasDriver: Boolean(driver),
    });
    retention.scope = scope;
    retention.db_user_id = userId;
    retention.auth_user_id = row.auth_user_id;

    const cancelledIds = await forceCancelActiveTrips(userId, driver?.id ?? null, now);
    retention.force_cancelled_trips = cancelledIds;

    await db.delete(pushTokens).where(eq(pushTokens.user_id, userId));

    if (driver) {
      await deleteStorageForDriver(driver.id, userRow?.avatar_url ?? null, deleteStoragePath);
    } else if (userRow?.avatar_url) {
      const path = extractStoragePath(userRow.avatar_url);
      if (path) {
        try {
          await deleteStoragePath(path);
        } catch {
          /* best-effort */
        }
      }
    }

    if (scope.anonymizeTrips) {
      await anonymizeTripsAndContent(userId, driver?.id ?? null);
    }

    await clearReviewerFks(userId);

    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.subject_type, 'passenger'), eq(userBlocks.subject_id, userId)));
    if (driver) {
      await db
        .delete(userBlocks)
        .where(and(eq(userBlocks.subject_type, 'driver'), eq(userBlocks.subject_id, driver.id)));
    }
    await db.delete(userCancelationMetrics).where(eq(userCancelationMetrics.user_id, userId));

    Object.assign(retention, await snapshotAccounting(userId, driver?.id ?? null));

    if (scope.deletePassengerProfile) {
      await db.delete(passengerProfiles).where(eq(passengerProfiles.user_id, userId));
    }
    if (scope.deleteDriverGraph && driver) {
      await deleteDriverGraph(driver.id);
    }

    // debt row has no FK — leave in place for accounting (user_id orphan OK)
    if (userRow) {
      await db.delete(users).where(eq(users.id, userId));
    }

    const authId = row.auth_user_id ?? userId;
    await deleteAuthUser(authId);
    retention.auth_deleted = true;
    if (row.auth_user_id && row.auth_user_id !== userId) {
      try {
        await deleteAuthUser(userId);
      } catch {
        /* optional second id */
      }
    }

    await db
      .update(accountDeletionRequests)
      .set({
        status: 'completed',
        completed_at: now,
        updated_at: now,
        retention_details: retention,
        error_details: null,
      })
      .where(eq(accountDeletionRequests.id, requestId));

    try {
      await sendCompletionEmail(email);
    } catch (err) {
      logger.warn('[account-deletion] completion email failed', {
        requestId,
        message: (err as Error).message,
      });
    }

    return { request_id: requestId, status: 'completed' };
  } catch (err) {
    if (err instanceof AppError && err.code === 'STAFF_FORBIDDEN') {
      return { request_id: requestId, status: 'rejected' };
    }

    const message = err instanceof Error ? err.message.slice(0, 500) : 'unknown';
    await db
      .update(accountDeletionRequests)
      .set({
        status: 'failed',
        error_details: message,
        updated_at: new Date(),
        retention_details: retention,
      })
      .where(eq(accountDeletionRequests.id, requestId));

    throw err;
  }
}

export async function findActiveTripsForUser(
  userId: string,
): Promise<{ id: string; status: string }[]> {
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);

  const passengerActive = await db
    .select({ id: trips.id, status: trips.status })
    .from(trips)
    .where(and(eq(trips.passenger_id, userId), inArray(trips.status, [...ACTIVE_TRIP_STATUSES])));

  const driverActive = driver
    ? await db
        .select({ id: trips.id, status: trips.status })
        .from(trips)
        .where(
          and(eq(trips.driver_id, driver.id), inArray(trips.status, [...ACTIVE_TRIP_STATUSES])),
        )
    : [];

  const seen = new Set<string>();
  return [...passengerActive, ...driverActive].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}
