import { createHash } from 'node:crypto';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers, users } from '../../shared/db/schema';
import { createSession, getSessionDecision } from '../../shared/lib/didit';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

const VALID_STATUSES = [
  'pending',
  'in_progress',
  'under_review',
  'approved',
  'rejected',
  'expired',
];

// DIDIT v3 status labels → internal kyc_status. Unknown/internal values pass
// through unchanged (so an already-internal status or a bogus one is preserved).
const DIDIT_STATUS_MAP: Record<string, string> = {
  Approved: 'approved',
  Declined: 'rejected',
  'In Review': 'under_review',
  'In Progress': 'in_progress',
  'Not Started': 'pending',
  Expired: 'expired',
  'Kyc Expired': 'expired',
};

export function mapKycStatus(raw: string): string {
  return DIDIT_STATUS_MAP[raw] ?? raw;
}

// Forward-only transitions. A real DIDIT flow can jump straight to a terminal
// state (e.g. pending → approved), so every non-terminal state may advance to
// any "later" state. Terminal states never transition out.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'under_review', 'approved', 'rejected', 'expired'],
  in_progress: ['under_review', 'approved', 'rejected', 'expired'],
  under_review: ['approved', 'rejected', 'expired'],
  approved: [],
  rejected: [],
  expired: [],
};

function hashDocumentNumber(documentNumber: string): string {
  return createHash('sha256').update(documentNumber).digest('hex');
}

export const kycService = {
  async getSession(user: AuthUser, driverId: string) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.user_id, user.id)))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found or does not belong to you');

    return createSession(user.id);
  },

  // KYC is user-level (vendor_data = user.id), so the app can start a session
  // without knowing the driver row id. Resets kyc_status to 'pending' on both
  // users and drivers so the DIDIT webhook can transition out of any prior state.
  async createUserSession(user: AuthUser) {
    await db
      .update(users)
      .set({ kyc_status: 'pending', updated_at: new Date() })
      .where(eq(users.id, user.id));

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (driver) {
      await db
        .update(drivers)
        .set({ kyc_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    return createSession(user.id);
  },

  async processWebhook(
    userId: string,
    status: string,
    webhookData?: { documentNumber?: string; fullName?: string },
  ) {
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'BAD_REQUEST');
    }

    const [user] = await db
      .select({
        id: users.id,
        kyc_status: users.kyc_status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new NotFoundError('User not found');

    const allowed = ALLOWED_TRANSITIONS[user.kyc_status] ?? [];
    if (!allowed.includes(status)) {
      throw new AppError(
        `Invalid status transition from ${user.kyc_status} to ${status}`,
        400,
        'BAD_REQUEST',
      );
    }

    const userUpdateData: Record<string, unknown> = {
      kyc_status: status,
      updated_at: new Date(),
    };

    if (status === 'approved' && webhookData?.fullName) {
      userUpdateData.verified_name = webhookData.fullName;
    }

    if (status === 'approved' && webhookData?.documentNumber) {
      const docHash = hashDocumentNumber(webhookData.documentNumber);
      const last4 = webhookData.documentNumber.slice(-4);

      const [duplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.verified_document_hash, docHash),
            ne(users.id, user.id),
            isNotNull(users.verified_document_hash),
          ),
        )
        .limit(1);

      if (duplicate) {
        logger.warn('[KYC] Duplicate document detected', {
          userId: userId.split('-')[0],
          duplicateUserId: duplicate.id.split('-')[0],
        });
      }

      userUpdateData.verified_document_hash = docHash;
      userUpdateData.document_number = webhookData.documentNumber.trim();
      userUpdateData.document_number_last4 = last4;
    }

    await db.update(users).set(userUpdateData).where(eq(users.id, userId));

    const driverUpdateData: Record<string, unknown> = {
      kyc_status: status,
      updated_at: new Date(),
    };

    // KYC approval only verifies identity — it does NOT approve the driver.
    // The driver still has to complete the vehicle + documents steps and pass
    // admin review before `drivers.status` becomes 'approved'. We only advance
    // the onboarding status out of the KYC gate so the app routes to the
    // vehicle step next.
    if (status === 'approved') {
      const [drv] = await db
        .select({ status: drivers.status })
        .from(drivers)
        .where(eq(drivers.user_id, userId))
        .limit(1);
      if (
        drv &&
        (drv.status === 'step1' ||
          drv.status === 'pending' ||
          drv.status === 'kyc' ||
          drv.status === 'kyc_pending')
      ) {
        driverUpdateData.status = 'kyc_approved';
      }
    }

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, userId))
      .limit(1);

    if (driver) {
      await db.update(drivers).set(driverUpdateData).where(eq(drivers.id, driver.id));
    }

    logger.info('[KYC]', userId.split('-')[0], user.kyc_status, '→', status);
  },

  // Dev/reconciliation path: DIDIT cannot deliver webhooks to localhost, so the
  // mobile app calls this after the user returns from the hosted flow. It pulls
  // the authoritative decision from DIDIT and applies it. Lenient: a no-op or
  // not-yet-advanced status returns the current state instead of throwing.
  async refreshDecision(user: AuthUser, sessionId: string) {
    const decision = await getSessionDecision(sessionId);

    if (decision.vendor_data && decision.vendor_data !== user.id) {
      throw new ForbiddenError('Session does not belong to this user');
    }

    const mapped = mapKycStatus(decision.status);
    const [row] = await db
      .select({ kyc_status: users.kyc_status })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row) throw new NotFoundError('User not found');
    const current = row.kyc_status;

    if (!VALID_STATUSES.includes(mapped) || mapped === current) {
      return { kyc_status: current, didit_status: decision.status };
    }

    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(mapped)) {
      return { kyc_status: current, didit_status: decision.status };
    }

    const idv = decision.id_verifications?.[0];
    const fullName =
      idv?.full_name || [idv?.first_name, idv?.last_name].filter(Boolean).join(' ') || undefined;

    await this.processWebhook(user.id, mapped, {
      documentNumber: idv?.document_number,
      fullName,
    });

    return { kyc_status: mapped, didit_status: decision.status };
  },
};
