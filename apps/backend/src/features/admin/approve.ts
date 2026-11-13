import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers, vehicles } from '../../shared/db/schema';
import { driverDocuments } from '../../shared/db/schema/driver-documents';
import { users } from '../../shared/db/schema/users';
import { broadcastDriverAccountUpdated } from '../../shared/lib/broadcast';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { isAllowedMotoLicenseCategory } from '../../shared/lib/moto-license-category';
import { shouldClearProfessionalGraceTimestamps } from '../../shared/lib/professional-license-grace';
import { sendPushToUser } from '../../shared/lib/push';
import { DRIVER_APPROVED_PUSH } from './driver-review-push';

export type ApprovalTokenPeek = {
  driverId: string;
  fullName: string;
  status: string;
};

/** Validate token without consuming it (GET confirm screen). */
export async function peekApprovalToken(token: string): Promise<ApprovalTokenPeek> {
  const [driver] = await db
    .select({
      id: drivers.id,
      status: drivers.status,
      user_id: drivers.user_id,
    })
    .from(drivers)
    .where(eq(drivers.approval_token, token))
    .limit(1);

  if (!driver) {
    throw new NotFoundError('Token de aprobacion invalido o ya usado');
  }

  const [userRow] = await db
    .select({ full_name: users.full_name })
    .from(users)
    .where(eq(users.id, driver.user_id))
    .limit(1);

  return {
    driverId: driver.id,
    fullName: userRow?.full_name?.trim() || 'Conductor',
    status: driver.status,
  };
}

export async function approveDriver(token: string): Promise<{ message: string }> {
  const [driver] = await db
    .select({
      id: drivers.id,
      user_id: drivers.user_id,
      status: drivers.status,
      identification_status: drivers.identification_status,
      license_professional_status: drivers.license_professional_status,
      license_category: drivers.license_category,
    })
    .from(drivers)
    .where(eq(drivers.approval_token, token))
    .limit(1);

  if (!driver) {
    throw new NotFoundError('Token de aprobacion invalido o ya usado');
  }

  if (driver.status === 'approved') {
    throw new AppError('Este conductor ya fue aprobado', 400, 'ALREADY_APPROVED');
  }

  const now = new Date();

  const identificationPatch =
    driver.identification_status === 'issued'
      ? {}
      : { identification_status: 'pending_pickup' as const };

  const prevProf = driver.license_professional_status;
  const promoteProfessional = prevProf === 'pending_professional';
  let professionalPatch: {
    license_professional_status?: string;
    license_category?: string;
    professional_license_grace_started_at?: null;
    professional_license_due_at?: null;
  } = {};

  if (promoteProfessional) {
    const nextProf = 'professional' as const;
    professionalPatch = {
      license_professional_status: nextProf,
      ...(shouldClearProfessionalGraceTimestamps(prevProf, nextProf)
        ? {
            professional_license_grace_started_at: null,
            professional_license_due_at: null,
          }
        : {}),
    };

    const [veh] = await db
      .select({ vehicle_type: vehicles.vehicle_type })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id))
      .limit(1);
    const vt = (veh?.vehicle_type ?? '').trim().toLowerCase();
    const isMoto = vt === 'motorcycle' || vt === 'moto';
    const catIsMoto = isAllowedMotoLicenseCategory(driver.license_category);
    // Auto path: stamp professional category. Never overwrite moto A1.x classes.
    if (!isMoto && !catIsMoto) {
      professionalPatch.license_category = 'professional';
    }
  }

  await db
    .update(drivers)
    .set({
      status: 'approved',
      admin_review_status: 'approved',
      approval_token: null,
      approved_at: now,
      admin_reviewed_at: now,
      documents_pending_review: false,
      ...identificationPatch,
      ...professionalPatch,
      updated_at: now,
    })
    .where(eq(drivers.id, driver.id));

  await db
    .update(driverDocuments)
    .set({ status: 'approved', verified_at: now })
    .where(
      and(eq(driverDocuments.driver_id, driver.id), eq(driverDocuments.status, 'pending_review')),
    );

  const [userRow] = await db
    .select({ full_name: users.full_name })
    .from(users)
    .where(eq(users.id, driver.user_id))
    .limit(1);

  logger.info('[ADMIN-APPROVE] Driver approved (platform)', {
    driverId: driver.id.split('-')[0],
  });

  sendPushToUser(driver.user_id, {
    app: 'driver',
    title: DRIVER_APPROVED_PUSH.title,
    body: DRIVER_APPROVED_PUSH.body,
    data: { ...DRIVER_APPROVED_PUSH.data },
    channelId: DRIVER_APPROVED_PUSH.channelId,
  }).catch((err) => {
    logger.error('[ADMIN-APPROVE] Push failed', (err as Error).message);
  });

  broadcastDriverAccountUpdated(driver.id, {
    reason: 'review',
    action: 'approve',
    status: 'approved',
    via: 'approval_token',
  });

  return {
    message: `Conductor ${userRow?.full_name ?? driver.id} aprobado. Debe retirar stickers en tránsito (plazo 30 días; después se suspende).`,
  };
}
