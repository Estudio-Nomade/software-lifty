import { and, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  commissionPhases,
  districts,
  driverAccountMessages,
  driverDocuments,
  drivers,
  platformConfig,
  users,
  vehicles,
} from '../../shared/db/schema';
import {
  broadcastDriverAccountUpdated,
  broadcastPlatformConfigUpdated,
} from '../../shared/lib/broadcast';
import { getCommissionConfig } from '../../shared/lib/commission';
import { DOC_TYPES, VALID_DOC_TYPES, docTypeLabel } from '../../shared/lib/documents';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { evaluateIdentificationDeadline } from '../../shared/lib/identification-deadline';
import { logger } from '../../shared/lib/logger';
import { evaluateProfessionalLicenseGrace } from '../../shared/lib/professional-license-grace';
import { sendPushToUser, sendPushToUserDetailed } from '../../shared/lib/push';
import type { AuthUser } from '../../shared/middleware/auth';
import { ensureDriverEnteredReview } from '../drivers/service';
import {
  DRIVER_APPROVED_PUSH,
  driverRejectedPush,
  driverReviewNotesPush,
} from './driver-review-push';
import {
  notifyDriverApproved,
  notifyDriverRejected,
  notifyDriverReviewNotes,
} from './notifications';

const ACCOUNT_MESSAGES_LIMIT = 50;

const EMPTY_PROFESSIONAL_LICENSE_DETAIL = {
  license_category: null as string | null,
  license_professional_status: 'unknown' as string,
  professional_license_grace_started_at: null as Date | null,
  professional_license_due_at: null as Date | null,
};

function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Coerce query pagination to a finite int; invalid/NaN → fallback. */
function pageInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

const NOT_PENDING_QUEUE = new Set(['review', 'approved', 'suspended']);

type DriverDetailRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  kyc_status: string | null;
  verified_name: string | null;
  document_number: string | null;
  document_number_last4: string | null;
  admin_review_status: string;
  admin_reviewed_at: Date | string | null;
  admin_review_notes: string | null;
  documents_pending_review: boolean | null;
  identification_status: string | null;
  identification_issued_at: Date | string | null;
  identification_external_ref: string | null;
  approved_at: Date | string | null;
  is_online: boolean | null;
  platform_debt: number | string | null;
  commission_fraud_block: boolean | null;
  district_id: string | null;
  district_name: string | null;
  district_province: string | null;
  created_at: Date | string;
  total_trips: number | null;
  license_category: string | null;
  license_professional_status: string | null;
  professional_license_grace_started_at: Date | string | null;
  professional_license_due_at: Date | string | null;
};

/** Exported for unit coverage of schema-drift detection (prod wabdd missing 0048). */
export function isMissingDriverDetailRelationError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? '');
  return (
    /commission_fraud_block/i.test(msg) ||
    /driver_commission_receipts/i.test(msg) ||
    (/does not exist/i.test(msg) && /drivers|relation/i.test(msg)) ||
    /42703/.test(msg)
  );
}

/**
 * Load admin driver ficha row. Prefer full select (incl. commission_fraud_block).
 * If cloud DB lacks migration 0048 (`commission_fraud_block` / receipts), fall back
 * so GET /admin/drivers/:id still 200 instead of safeCall 500.
 */
async function loadDriverDetailRow(driverId: string): Promise<DriverDetailRow | null> {
  const baseSelect = {
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
    documents_pending_review: drivers.documents_pending_review,
    identification_status: drivers.identification_status,
    identification_issued_at: drivers.identification_issued_at,
    identification_external_ref: drivers.identification_external_ref,
    approved_at: drivers.approved_at,
    is_online: drivers.is_online,
    platform_debt: drivers.platform_debt,
    district_id: drivers.district_id,
    district_name: districts.name,
    district_province: districts.province,
    created_at: drivers.created_at,
    total_trips: drivers.total_trips,
  };
  const licenseSelect = {
    license_category: drivers.license_category,
    license_professional_status: drivers.license_professional_status,
    professional_license_grace_started_at: drivers.professional_license_grace_started_at,
    professional_license_due_at: drivers.professional_license_due_at,
  };

  try {
    const [row] = await db
      .select({
        ...baseSelect,
        ...licenseSelect,
        commission_fraud_block: drivers.commission_fraud_block,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(eq(drivers.id, driverId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (!isMissingDriverDetailRelationError(err)) throw err;
    logger.warn('[admin] getDriverDetail schema drift — retry without optional cols', {
      driverId: driverId.slice(0, 8),
      message: (err as Error).message,
    });
    try {
      const [row] = await db
        .select({
          ...baseSelect,
          ...licenseSelect,
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.user_id, users.id))
        .leftJoin(districts, eq(drivers.district_id, districts.id))
        .where(eq(drivers.id, driverId))
        .limit(1);
      if (!row) return null;
      return { ...row, commission_fraud_block: false };
    } catch (err2) {
      if (!isMissingDriverDetailRelationError(err2)) throw err2;
      logger.warn('[admin] getDriverDetail schema drift — retry without license cols', {
        driverId: driverId.slice(0, 8),
        message: (err2 as Error).message,
      });
      const [row] = await db
        .select(baseSelect)
        .from(drivers)
        .innerJoin(users, eq(drivers.user_id, users.id))
        .leftJoin(districts, eq(drivers.district_id, districts.id))
        .where(eq(drivers.id, driverId))
        .limit(1);
      if (!row) return null;
      return { ...row, commission_fraud_block: false, ...EMPTY_PROFESSIONAL_LICENSE_DETAIL };
    }
  }
}

export const adminService = {
  /**
   * Heal stuck drivers (docs complete, status still pending/step1/… or rejected
   * after full re-upload) so ops queue matches product:
   * register+docs → Pendientes → approve → Conductores.
   * Also re-enters rejected+complete so Aprobar/Rechazar return on ficha.
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
    const limit = pageInt(opts?.limit, 100, 1, 200);
    const offset = pageInt(opts?.offset, 0, 0, 1_000_000);
    const q = opts?.q?.trim();
    const status = opts?.status?.trim() || undefined;
    const identificationStatus = opts?.identification_status?.trim() || undefined;

    const filters = [];
    if (status) filters.push(eq(drivers.status, status));
    if (identificationStatus) {
      filters.push(eq(drivers.identification_status, identificationStatus));
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
      const id = row.id ?? '';
      return {
        ...row,
        /** Ops-facing ID: DNI if known, else last4, else short driver uuid. */
        registry_id:
          row.document_number?.trim() ||
          (row.document_number_last4 ? `****${row.document_number_last4}` : id.slice(0, 8) || id),
        identification_phase: identification.phase,
        identification_blocks_online: identification.blocks_online,
        identification_days_until_pause: identification.days_until_pause,
        identification_days_since_approval: identification.days_since_approval,
        identification_pause_at: identification.pause_at,
      };
    });

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(whereClause);
    const total = Number(countRows[0]?.count ?? 0);

    return { items: enriched, total, limit, offset };
  },

  async getDriverDetail(driverId: string) {
    // Heal stuck rejected+complete (or pending/step1+complete) so Aprobar/Rechazar
    // appear without a separate requeue endpoint.
    await ensureDriverEnteredReview(driverId);

    const driver = await loadDriverDetailRow(driverId);
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
        engine_cc: vehicles.engine_cc,
        insurance_coverage_type: vehicles.insurance_coverage_type,
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
        ops_ok: driverDocuments.ops_ok,
        review_comment: driverDocuments.review_comment,
        ops_reviewed_at: driverDocuments.ops_reviewed_at,
        ops_reviewed_by: driverDocuments.ops_reviewed_by,
      })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id))
      .orderBy(driverDocuments.created_at);

    const activeDocTypes = new Set(
      documentRows
        .filter((d) => d.status !== 'superseded' && d.status !== 'rejected')
        .map((d) => d.doc_type),
    );
    const missing_doc_types = DOC_TYPES.filter((t) => !activeDocTypes.has(t));

    const identification = evaluateIdentificationDeadline({
      identification_status: driver.identification_status,
      approved_at: driver.approved_at,
      admin_reviewed_at: driver.admin_reviewed_at,
      created_at: driver.created_at,
    });

    const professionalLicense = evaluateProfessionalLicenseGrace({
      license_category: driver.license_category,
      license_professional_status: driver.license_professional_status,
      professional_license_grace_started_at: driver.professional_license_grace_started_at,
      professional_license_due_at: driver.professional_license_due_at,
    });

    const messageRows = await db
      .select({
        id: driverAccountMessages.id,
        type: driverAccountMessages.type,
        body: driverAccountMessages.body,
        created_at: driverAccountMessages.created_at,
        email_status: driverAccountMessages.email_status,
        push_status: driverAccountMessages.push_status,
        read_at: driverAccountMessages.read_at,
        author_id: users.id,
        author_full_name: users.full_name,
        author_email: users.email,
      })
      .from(driverAccountMessages)
      .leftJoin(users, eq(driverAccountMessages.author_admin_user_id, users.id))
      .where(eq(driverAccountMessages.driver_id, driver.id))
      .orderBy(desc(driverAccountMessages.created_at))
      .limit(ACCOUNT_MESSAGES_LIMIT);

    const account_messages = messageRows.map((row) => ({
      id: row.id,
      type: row.type,
      body: row.body,
      created_at: row.created_at,
      email_status: row.email_status,
      push_status: row.push_status,
      read_at: row.read_at,
      author: row.author_id
        ? {
            id: row.author_id,
            full_name: row.author_full_name,
            email: row.author_email,
          }
        : null,
    }));

    return {
      ...driver,
      platform_debt: Math.round(Number(driver.platform_debt ?? 0)),
      commission_fraud_block: Boolean(driver.commission_fraud_block),
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
      license_category: professionalLicense.license_category,
      license_professional_status: professionalLicense.license_professional_status,
      professional_license_phase: professionalLicense.phase,
      professional_license_show_banner: professionalLicense.show_banner,
      professional_license_blocks_online: professionalLicense.blocks_online,
      professional_license_grace_days: professionalLicense.grace_days,
      professional_license_grace_started_at: professionalLicense.grace_started_at,
      professional_license_due_at: professionalLicense.due_at,
      professional_license_days_remaining: professionalLicense.days_remaining,
      professional_license_days_elapsed: professionalLicense.days_elapsed,
      missing_doc_types,
      vehicles: vehicleRows,
      documents: documentRows,
      account_messages,
    };
  },

  /**
   * Per-document ops review: tick OK and/or request a fix with a comment.
   * Does not approve/reject the driver account (global review still separate).
   */
  async reviewDocument(
    adminUser: AuthUser,
    driverId: string,
    documentId: string,
    body: {
      ops_ok?: boolean;
      review_comment?: string | null;
      request_fix?: boolean;
    },
  ) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    if (!driver) throw new NotFoundError('Driver not found');

    const [doc] = await db
      .select({
        id: driverDocuments.id,
        driver_id: driverDocuments.driver_id,
        doc_type: driverDocuments.doc_type,
        status: driverDocuments.status,
        ops_ok: driverDocuments.ops_ok,
        review_comment: driverDocuments.review_comment,
      })
      .from(driverDocuments)
      .where(and(eq(driverDocuments.id, documentId), eq(driverDocuments.driver_id, driverId)))
      .limit(1);

    if (!doc) throw new NotFoundError('Document not found');
    if (doc.status === 'superseded') {
      throw new AppError('Document is superseded and not editable', 400, 'DOC_SUPERSEDED');
    }

    const wantsFix = body.request_fix === true;
    const commentRaw =
      body.review_comment === undefined || body.review_comment === null
        ? body.review_comment
        : body.review_comment.trim();
    const commentProvided = body.review_comment !== undefined;
    const trimmedComment =
      typeof commentRaw === 'string' && commentRaw.length > 0 ? commentRaw : null;

    if (wantsFix) {
      if (!trimmedComment || trimmedComment.length < 5) {
        throw new AppError(
          'Indicá qué corregir en este documento (mín. 5 caracteres)',
          400,
          'NOTES_REQUIRED',
        );
      }
    }

    // Non-empty comment without request_fix would flip ops_ok and leave the
    // driver un-notified. Admin UI always pairs comment with request_fix.
    if (trimmedComment && !wantsFix && body.ops_ok !== true) {
      throw new AppError(
        'Para guardar un comentario usá request_fix:true (notifica al conductor)',
        400,
        'REQUEST_FIX_REQUIRED',
      );
    }

    if (body.ops_ok === undefined && !wantsFix && !commentProvided) {
      throw new AppError('Nothing to update', 400, 'EMPTY_PATCH');
    }

    const now = new Date();
    const patch: {
      ops_ok?: boolean;
      review_comment?: string | null;
      ops_reviewed_at: Date;
      ops_reviewed_by: string;
    } = {
      ops_reviewed_at: now,
      ops_reviewed_by: adminUser.id,
    };

    if (wantsFix) {
      patch.ops_ok = false;
      patch.review_comment = trimmedComment;
    } else if (body.ops_ok === true) {
      // OK tick clears prior fix comment (doc already verified).
      patch.ops_ok = true;
      patch.review_comment = null;
    } else if (body.ops_ok === false) {
      patch.ops_ok = false;
      // Explicit null clears stored comment without notifying.
      if (commentProvided && trimmedComment === null) {
        patch.review_comment = null;
      }
    } else if (commentProvided && trimmedComment === null) {
      patch.review_comment = null;
    }

    const [updated] = await db
      .update(driverDocuments)
      .set(patch)
      .where(eq(driverDocuments.id, documentId))
      .returning({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        status: driverDocuments.status,
        superseded_at: driverDocuments.superseded_at,
        created_at: driverDocuments.created_at,
        ops_ok: driverDocuments.ops_ok,
        review_comment: driverDocuments.review_comment,
        ops_reviewed_at: driverDocuments.ops_reviewed_at,
        ops_reviewed_by: driverDocuments.ops_reviewed_by,
      });

    if (!updated) throw new NotFoundError('Document not found');

    let account_message: {
      id: string;
      type: string;
      body: string;
      created_at: Date;
      email_status: string | null;
      push_status: string | null;
    } | null = null;

    if (wantsFix && trimmedComment) {
      const messageBody = `«${docTypeLabel(updated.doc_type)}»: ${trimmedComment}`;

      const [inserted] = await db
        .insert(driverAccountMessages)
        .values({
          driver_id: driverId,
          author_admin_user_id: adminUser.id,
          type: 'review_notes',
          body: messageBody,
        })
        .returning({
          id: driverAccountMessages.id,
          body: driverAccountMessages.body,
          type: driverAccountMessages.type,
          created_at: driverAccountMessages.created_at,
        });

      // Soft global notes stay in sync with last ops message (non-terminal).
      await db
        .update(drivers)
        .set({
          admin_review_notes: messageBody,
          updated_at: now,
        })
        .where(eq(drivers.id, driverId));

      const [driverUser] = await db
        .select({
          user_id: users.id,
          email: users.email,
          full_name: users.full_name,
        })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, driverId))
        .limit(1);

      let emailStatus: string | null = null;
      let pushStatus: string | null = null;

      const [unreadRow] = await db
        .select({ count: count() })
        .from(driverAccountMessages)
        .where(
          and(eq(driverAccountMessages.driver_id, driverId), isNull(driverAccountMessages.read_at)),
        );
      const unreadBadge = Number(unreadRow?.count ?? 0);

      if (driverUser) {
        const name = driverUser.full_name ?? 'Driver';
        if (driverUser.email) {
          const emailOk = await notifyDriverReviewNotes(driverUser.email, name, messageBody);
          emailStatus = emailOk ? 'sent' : 'failed';
        } else {
          emailStatus = 'skipped';
          logger.info('[DRIVER-NOTIFY] Skip doc-review email — no email', {
            driverId: driverId.split('-')[0],
          });
        }

        const notesPush = driverReviewNotesPush(messageBody, inserted?.id, unreadBadge, {
          doc_type: updated.doc_type,
          document_id: updated.id,
        });
        try {
          const pushResult = await sendPushToUserDetailed(driverUser.user_id, notesPush);
          pushStatus = pushResult.status;
          logger.info('[DRIVER-NOTIFY] Doc-review push', {
            userId: driverUser.user_id.slice(0, 8),
            messageId: inserted?.id?.slice(0, 8),
            docType: updated.doc_type,
            tokenCount: pushResult.tokenCount,
            push_status: pushResult.status,
            badge: unreadBadge,
          });
        } catch (err) {
          pushStatus = 'failed';
          logger.error('[DRIVER-NOTIFY] Doc-review push failed', (err as Error).message);
        }
      } else {
        emailStatus = 'skipped';
        pushStatus = 'zero_tokens';
      }

      if (inserted?.id) {
        await db
          .update(driverAccountMessages)
          .set({
            email_status: emailStatus,
            push_status: pushStatus,
          })
          .where(eq(driverAccountMessages.id, inserted.id));
      }

      account_message = inserted
        ? {
            id: inserted.id,
            type: inserted.type,
            body: inserted.body,
            created_at: inserted.created_at,
            email_status: emailStatus,
            push_status: pushStatus,
          }
        : null;

      broadcastDriverAccountUpdated(driverId, {
        reason: 'review',
        action: 'doc_comment',
        document_id: updated.id,
        doc_type: updated.doc_type,
        message_id: inserted?.id ?? null,
      });
    }

    return {
      document: updated,
      account_message,
    };
  },

  async reviewDriver(
    adminUser: AuthUser,
    driverId: string,
    action: 'approve' | 'reject' | 'request_changes',
    notes?: string,
    rejectDocTypes?: string[],
  ) {
    const trimmedNotes = notes?.trim() || undefined;
    if (action === 'request_changes' && (!trimmedNotes || trimmedNotes.length < 5)) {
      throw new AppError(
        'Indicá qué docs faltan o qué corregir (mín. 5 caracteres)',
        400,
        'NOTES_REQUIRED',
      );
    }

    const uniqueRejectTypes =
      action === 'reject' && rejectDocTypes?.length
        ? [...new Set(rejectDocTypes.map((t) => t.trim()).filter(Boolean))]
        : [];
    if (uniqueRejectTypes.length > 0) {
      const invalid = uniqueRejectTypes.filter(
        (t) => !(VALID_DOC_TYPES as readonly string[]).includes(t),
      );
      if (invalid.length > 0) {
        throw new AppError(
          `Invalid reject_doc_types: ${invalid.join(', ')}`,
          400,
          'INVALID_REJECT_DOC_TYPES',
        );
      }
    }

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

    const now = new Date();

    // Soft message: stay in review queue, keep docs pending, notify driver to re-upload.
    if (action === 'request_changes') {
      const [inserted] = await db
        .insert(driverAccountMessages)
        .values({
          driver_id: driverId,
          author_admin_user_id: adminUser.id,
          type: 'review_notes',
          body: trimmedNotes!,
        })
        .returning({
          id: driverAccountMessages.id,
          body: driverAccountMessages.body,
          type: driverAccountMessages.type,
          created_at: driverAccountMessages.created_at,
        });

      await db
        .update(drivers)
        .set({
          admin_review_notes: trimmedNotes!,
          updated_at: now,
        })
        .where(eq(drivers.id, driverId));

      const [driverUser] = await db
        .select({
          user_id: users.id,
          email: users.email,
          full_name: users.full_name,
        })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, driverId))
        .limit(1);

      let emailStatus: string | null = null;
      let pushStatus: string | null = null;

      // Unread after this insert (for iOS/Android app-icon badge on the push).
      const [unreadRow] = await db
        .select({ count: count() })
        .from(driverAccountMessages)
        .where(
          and(eq(driverAccountMessages.driver_id, driverId), isNull(driverAccountMessages.read_at)),
        );
      const unreadBadge = Number(unreadRow?.count ?? 0);

      if (driverUser) {
        const name = driverUser.full_name ?? 'Driver';
        if (driverUser.email) {
          const emailOk = await notifyDriverReviewNotes(driverUser.email, name, trimmedNotes!);
          emailStatus = emailOk ? 'sent' : 'failed';
        } else {
          emailStatus = 'skipped';
          logger.info('[DRIVER-NOTIFY] Skip review-notes email — no email', {
            driverId: driverId.split('-')[0],
          });
        }

        const notesPush = driverReviewNotesPush(trimmedNotes, inserted?.id, unreadBadge);
        try {
          const pushResult = await sendPushToUserDetailed(driverUser.user_id, notesPush);
          pushStatus = pushResult.status;
          logger.info('[DRIVER-NOTIFY] Review-notes push', {
            userId: driverUser.user_id.slice(0, 8),
            messageId: inserted?.id?.slice(0, 8),
            tokenCount: pushResult.tokenCount,
            push_status: pushResult.status,
            badge: unreadBadge,
          });
        } catch (err) {
          pushStatus = 'failed';
          logger.error('[DRIVER-NOTIFY] Review-notes push failed', (err as Error).message);
        }
      } else {
        emailStatus = 'skipped';
        pushStatus = 'zero_tokens';
      }

      if (inserted?.id) {
        await db
          .update(driverAccountMessages)
          .set({
            email_status: emailStatus,
            push_status: pushStatus,
          })
          .where(eq(driverAccountMessages.id, inserted.id));
      }

      broadcastDriverAccountUpdated(driverId, {
        reason: 'review',
        action: 'request_changes',
        message_id: inserted?.id ?? null,
      });

      return {
        driver_id: driver.id,
        action,
        status: 'review',
        message: 'Review notes sent to driver',
        account_message: inserted
          ? {
              id: inserted.id,
              type: inserted.type,
              body: inserted.body,
              created_at: inserted.created_at,
              email_status: emailStatus,
              push_status: pushStatus,
            }
          : null,
      };
    }

    const isApprove = action === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';
    const identificationPatch =
      isApprove && driver.identification_status !== 'issued'
        ? { identification_status: 'pending_pickup' as const }
        : {};

    await db
      .update(drivers)
      .set({
        status: newStatus,
        admin_review_status: newStatus,
        admin_reviewed_by: adminUser.id,
        admin_reviewed_at: now,
        admin_review_notes: trimmedNotes ?? null,
        documents_pending_review: false,
        ...(isApprove ? { approved_at: now } : {}),
        ...identificationPatch,
        updated_at: now,
      })
      .where(eq(drivers.id, driverId));

    // Approve: all pending_review → approved.
    // Reject: never mass-reject; only listed reject_doc_types (if any) → rejected.
    if (isApprove) {
      await db
        .update(driverDocuments)
        .set({ status: 'approved', verified_at: now })
        .where(
          and(
            eq(driverDocuments.driver_id, driverId),
            eq(driverDocuments.status, 'pending_review'),
          ),
        );
    } else if (uniqueRejectTypes.length > 0) {
      await db
        .update(driverDocuments)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(driverDocuments.driver_id, driverId),
            inArray(driverDocuments.doc_type, uniqueRejectTypes),
            ne(driverDocuments.status, 'superseded'),
          ),
        );
    }

    {
      const [driverUser] = await db
        .select({
          user_id: users.id,
          email: users.email,
          full_name: users.full_name,
        })
        .from(users)
        .innerJoin(drivers, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, driverId))
        .limit(1);

      if (driverUser) {
        const name = driverUser.full_name ?? 'Driver';
        if (isApprove) {
          if (driverUser.email) {
            void notifyDriverApproved(driverUser.email, name);
          } else {
            logger.info('[DRIVER-NOTIFY] Skip approved email — no email', {
              driverId: driverId.split('-')[0],
            });
          }
          void sendPushToUser(driverUser.user_id, {
            title: DRIVER_APPROVED_PUSH.title,
            body: DRIVER_APPROVED_PUSH.body,
            data: { ...DRIVER_APPROVED_PUSH.data },
            channelId: DRIVER_APPROVED_PUSH.channelId,
          }).catch((err) => {
            logger.error('[DRIVER-NOTIFY] Approved push failed', (err as Error).message);
          });
        } else {
          if (driverUser.email) {
            void notifyDriverRejected(driverUser.email, name, trimmedNotes);
          } else {
            logger.info('[DRIVER-NOTIFY] Skip rejected email — no email', {
              driverId: driverId.split('-')[0],
            });
          }
          const rejected = driverRejectedPush(trimmedNotes);
          void sendPushToUser(driverUser.user_id, rejected).catch((err) => {
            logger.error('[DRIVER-NOTIFY] Rejected push failed', (err as Error).message);
          });
        }
      }
    }

    broadcastDriverAccountUpdated(driverId, {
      reason: 'review',
      action,
      status: newStatus,
    });

    return {
      driver_id: driver.id,
      action,
      status: newStatus,
      message: isApprove ? 'Driver approved' : 'Driver rejected',
    };
  },

  async listCommissionPhases() {
    return db.select().from(commissionPhases).orderBy(commissionPhases.day_start);
  },

  async updateCommissionPhase(
    id: string,
    data: {
      name?: string;
      day_start?: number;
      day_end?: number | null;
      base_rate?: number;
      daily_increment?: number | null;
      cap_rate?: number | null;
    },
  ) {
    const [existing] = await db
      .select()
      .from(commissionPhases)
      .where(eq(commissionPhases.id, id))
      .limit(1);

    if (!existing) throw new NotFoundError('Commission phase not found');

    const next = {
      name: data.name ?? existing.name,
      day_start: data.day_start ?? existing.day_start,
      day_end: data.day_end !== undefined ? data.day_end : existing.day_end,
      base_rate: data.base_rate ?? existing.base_rate,
      daily_increment:
        data.daily_increment !== undefined ? data.daily_increment : existing.daily_increment,
      cap_rate: data.cap_rate !== undefined ? data.cap_rate : existing.cap_rate,
    };

    if (next.day_end != null && next.day_end < next.day_start) {
      throw new AppError('day_end must be >= day_start', 400, 'BAD_REQUEST');
    }

    const others = await db.select().from(commissionPhases).where(ne(commissionPhases.id, id));

    for (const other of others) {
      const aStart = next.day_start;
      const aEnd = next.day_end ?? Number.POSITIVE_INFINITY;
      const bStart = other.day_start;
      const bEnd = other.day_end ?? Number.POSITIVE_INFINITY;
      if (aStart <= bEnd && bStart <= aEnd) {
        throw new AppError(
          `Phase range overlaps with "${other.name}" (days ${other.day_start}–${other.day_end ?? '∞'})`,
          400,
          'BAD_REQUEST',
        );
      }
    }

    const [updated] = await db
      .update(commissionPhases)
      .set({ ...next, updated_at: new Date() })
      .where(eq(commissionPhases.id, id))
      .returning();

    broadcastPlatformConfigUpdated({ reason: 'commission_phase', phase_id: id });
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

    broadcastPlatformConfigUpdated({ reason: 'commission_start_date', start_date: value });
    // Same shape as GET so admin can clear the "not configured" banner without a second fetch.
    return { start_date: value, configured: true as const };
  },

  async getCurrentCommission() {
    return getCommissionConfig(db);
  },
};
