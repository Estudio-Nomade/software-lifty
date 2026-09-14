import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers } from '../../shared/db/schema';
import { driverDocuments } from '../../shared/db/schema/driver-documents';
import { users } from '../../shared/db/schema/users';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';

export async function approveDriver(token: string): Promise<{ message: string }> {
  const [driver] = await db
    .select({
      id: drivers.id,
      user_id: drivers.user_id,
      status: drivers.status,
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

  const [current] = await db
    .select({ identification_status: drivers.identification_status })
    .from(drivers)
    .where(eq(drivers.id, driver.id))
    .limit(1);

  const identificationPatch =
    current?.identification_status === 'issued'
      ? {}
      : { identification_status: 'pending_pickup' as const };

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
    title: 'Documentos aprobados',
    body: 'Tus docs están OK. Retirá la identificación en tránsito de tu municipio para poder conectarte.',
    data: { type: 'kyc:approved' },
  }).catch((err) => {
    logger.error('[ADMIN-APPROVE] Push failed', (err as Error).message);
  });

  return {
    message: `Conductor ${userRow?.full_name ?? driver.id} aprobado. Debe retirar stickers en tránsito antes de conectarse.`,
  };
}
