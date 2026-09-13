import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import type { IssueIdentificationBody } from './schema';

export const transitBridgeService = {
  async issueIdentification(body: IssueIdentificationBody) {
    const [driver] = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
        identification_status: drivers.identification_status,
        identification_issued_at: drivers.identification_issued_at,
        identification_external_ref: drivers.identification_external_ref,
      })
      .from(drivers)
      .where(eq(drivers.id, body.driver_id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    const platformOk = driver.status === 'approved' && driver.admin_review_status === 'approved';
    if (!platformOk) {
      throw new AppError(
        'Driver is not platform-approved; cannot issue identification',
        409,
        'PLATFORM_NOT_APPROVED',
      );
    }

    if (driver.identification_status === 'issued') {
      return {
        ok: true as const,
        driver_id: driver.id,
        identification_status: 'issued' as const,
        identification_issued_at:
          driver.identification_issued_at?.toISOString() ?? new Date().toISOString(),
        idempotent: true as const,
      };
    }

    const issuedAt = body.issued_at ? new Date(body.issued_at) : new Date();
    if (Number.isNaN(issuedAt.getTime())) {
      throw new AppError('Invalid issued_at', 400, 'BAD_REQUEST');
    }

    const patch: {
      identification_status: string;
      identification_issued_at: Date;
      identification_external_ref?: string | null;
      district_id?: string;
      updated_at: Date;
    } = {
      identification_status: 'issued',
      identification_issued_at: issuedAt,
      updated_at: new Date(),
    };

    if (body.external_ref !== undefined) {
      patch.identification_external_ref = body.external_ref;
    }
    if (body.district_id) {
      patch.district_id = body.district_id;
    }

    await db.update(drivers).set(patch).where(eq(drivers.id, driver.id));

    logger.info('[TRANSIT-BRIDGE] identification issued', {
      driverId: driver.id.split('-')[0],
      externalRef: body.external_ref ? String(body.external_ref).slice(0, 32) : undefined,
    });

    sendPushToUser(driver.user_id, {
      title: 'Identificación lista',
      body: 'Ya podés conectarte en Lifty y aceptar viajes.',
      data: { type: 'identification:issued' },
    }).catch((err) => {
      logger.error('[TRANSIT-BRIDGE] Push failed', (err as Error).message);
    });

    return {
      ok: true as const,
      driver_id: driver.id,
      identification_status: 'issued' as const,
      identification_issued_at: issuedAt.toISOString(),
      idempotent: false as const,
    };
  },
};
