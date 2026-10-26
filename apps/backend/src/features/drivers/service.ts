import { and, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, getDb } from '../../shared/db/client';
import {
  districts,
  driverCommissionReceipts,
  driverDocuments,
  driverLocations,
  drivers,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import { getConfig, getDebtCapArs } from '../../shared/lib/commission';
import {
  VALID_DOC_TYPES as CANONICAL_VALID_DOC_TYPES,
  DOC_TYPES,
} from '../../shared/lib/documents';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { evaluateIdentificationDeadline } from '../../shared/lib/identification-deadline';
import { logger } from '../../shared/lib/logger';
import {
  assertMotoLicenseMatchesEngineCc,
  isAllowedMotoLicenseCategory,
  motoLicenseMatchesEngineCc,
  normalizeMotoLicenseCategory,
} from '../../shared/lib/moto-license-category';
import {
  buildGraceStartPatch,
  evaluateProfessionalLicenseGrace,
  resolveLicenseProfessionalStatus,
  shouldClearProfessionalGraceTimestamps,
  shouldStartProfessionalLicenseGrace,
} from '../../shared/lib/professional-license-grace';
import { sendPushToUser } from '../../shared/lib/push';
import {
  type StorageProvider,
  buildCommissionReceiptPath,
  buildDriverAvatarPath,
  buildDriverDocumentPath,
  contentTypeForFile,
  supabaseStorage,
} from '../../shared/lib/storage';
import { assertVehicleEngineCc, isMotoVehicleType } from '../../shared/lib/vehicle-engine-cc';
import {
  assertInsuranceCoverageForVehicle,
  hasValidMotoInsuranceCoverage,
} from '../../shared/lib/vehicle-insurance-coverage';
import { assertVehicleYear } from '../../shared/lib/vehicle-year';

let _storage: StorageProvider = supabaseStorage;

export function setStorageForTesting(sp: StorageProvider) {
  _storage = sp;
}
import { geocode } from '../../shared/lib/geo';
import type { AuthUser } from '../../shared/middleware/auth';
import { notifyAdminNewDriver, notifyAdminsDriverDocsResubmitted } from '../admin/notifications';
import { upsertLocation } from '../location/service';
import {
  type MunicipalityResolveResult,
  buildMunicipalityResult,
  matchDistrict,
  parseLocalityFromFormatted,
} from './municipality';

const VALID_DOC_TYPES: readonly string[] = CANONICAL_VALID_DOC_TYPES;

const MIN_ADDRESS_LENGTH = 3;

// Sensitive documents gate the driver's ability to go online: re-uploading one
// forces a fresh admin review and pauses "online" until approved. The server —
// never the client — decides sensitivity, so a driver can't dodge review by
// mislabelling a doc_type. Includes optional legacy types (e.g. insurance_back).
const SENSITIVE_DOC_TYPES = new Set<string>(CANONICAL_VALID_DOC_TYPES);

function hasAllRequiredDocs(uploaded: { doc_type: string }[]): boolean {
  const types = new Set(uploaded.map((d) => d.doc_type));
  return DOC_TYPES.every((t) => types.has(t));
}

const HARD_TERMINAL_DRIVER_STATUSES = new Set(['approved', 'suspended']);

function missingRequiredDocTypes(uploaded: { doc_type: string }[]): string[] {
  const types = new Set(uploaded.map((d) => d.doc_type));
  return DOC_TYPES.filter((t) => !types.has(t));
}

/**
 * Prod wabdd often lags monorepo migrations (#451–#453):
 * drivers.license_* / vehicles.engine_cc / vehicles.insurance_coverage_type.
 * Missing columns surface as Postgres 42703 → safeCall 500 on GET /me/status
 * (SessionRestore) and PUT /me vehicle step. Detect drift so we can soft-fallback.
 */
/** Only known #451–#453 onboarding cols — never blanket “any drivers/vehicles column”. */
const ONBOARDING_SCHEMA_COL_RE =
  /license_category|license_professional_status|professional_license_grace_started_at|professional_license_due_at|engine_cc|insurance_coverage_type/i;

export function isMissingOnboardingVehicleSchemaError(err: unknown): boolean {
  const e = err as { message?: string; code?: string; cause?: { message?: string; code?: string } };
  const msg = String(e?.message ?? e?.cause?.message ?? err ?? '');
  const code = String(e?.code ?? e?.cause?.code ?? '');
  const looksMissing = /does not exist/i.test(msg) || code === '42703' || /42703/.test(msg);
  if (!looksMissing) return false;
  return ONBOARDING_SCHEMA_COL_RE.test(msg);
}

const EMPTY_PROFESSIONAL_LICENSE_ROW = {
  license_category: null as string | null,
  license_professional_status: 'unknown' as string | null,
  professional_license_grace_started_at: null as Date | null,
  professional_license_due_at: null as Date | null,
};

/**
 * Blocks online when platform_debt > debt cap OR commission_fraud_block.
 * Force-offlines if currently online. Push only once per enforcement call
 * (toggle GO attempt, or heartbeat online→offline transition) — not on every
 * subsequent heartbeat while already offline.
 */
async function enforceCommissionDebtCap(params: {
  driverId: string;
  userId: string;
  platformDebt: number;
  commissionFraudBlock?: boolean;
  isOnline: boolean;
  /** When true, always notify (driver tried to go online). When false, only if force-offline flipped a row. */
  notifyOnBlock: boolean;
}): Promise<void> {
  if (params.commissionFraudBlock === true) {
    let forcedOffline = false;
    if (params.isOnline) {
      const flipped = await db
        .update(drivers)
        .set({ is_online: false, last_heartbeat: null, updated_at: new Date() })
        .where(and(eq(drivers.id, params.driverId), eq(drivers.is_online, true)))
        .returning({ id: drivers.id });
      forcedOffline = flipped.length > 0;
    }

    if (params.notifyOnBlock || forcedOffline) {
      void sendPushToUser(params.userId, {
        title: 'Cuenta bloqueada por comisión',
        body: 'Tu cuenta está bloqueada por revisión de comisión. Contactá a soporte Lifty.',
        data: {
          type: 'driver:commission_debt_block',
          reason: 'fraud_block',
        },
        channelId: 'account',
      }).catch((err) => {
        logger.error('[drivers] commission fraud block push failed', {
          error: (err as Error).message,
        });
      });
    }

    throw new AppError(
      'Tu cuenta está bloqueada por revisión de comisión. Contactá a soporte Lifty.',
      409,
      'COMMISSION_FRAUD_BLOCK',
    );
  }

  const debt = Number(params.platformDebt ?? 0);
  const cap = await getDebtCapArs(getDb());
  if (debt <= cap) return;

  let forcedOffline = false;
  if (params.isOnline) {
    // Only rows still online: concurrent heartbeats lose the race → no duplicate push.
    const flipped = await db
      .update(drivers)
      .set({ is_online: false, last_heartbeat: null, updated_at: new Date() })
      .where(and(eq(drivers.id, params.driverId), eq(drivers.is_online, true)))
      .returning({ id: drivers.id });
    forcedOffline = flipped.length > 0;
  }

  if (params.notifyOnBlock || forcedOffline) {
    void sendPushToUser(params.userId, {
      title: 'Deuda de comisión con Lifty',
      body: `Alcanzaste el límite de $${cap}. Debés $${Math.round(debt)}. Transferí el total y subí el comprobante para volver a conectarte.`,
      data: {
        type: 'driver:commission_debt_block',
        debt_cap_ars: String(cap),
        platform_debt: String(Math.round(debt)),
      },
      channelId: 'account',
    }).catch((err) => {
      logger.error('[drivers] commission debt block push failed', {
        error: (err as Error).message,
      });
    });
  }

  throw new AppError(
    `Alcanzaste el límite de $${cap} de deuda de comisión con Lifty (debés $${Math.round(debt)}). Transferí el total a Lifty y subí el comprobante para volver a conectarte.`,
    409,
    'COMMISSION_DEBT_CAP',
  );
}

function parseAmountArs(raw: number | string): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new AppError('El monto debe ser un entero mayor o igual a 1.', 400, 'INVALID_AMOUNT');
  }
  return n;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === '23505' || e?.cause?.code === '23505' || /unique/i.test(e?.message ?? '');
}

/**
 * Idempotent: if all required docs are present (non-superseded, non-rejected),
 * set status=review + admin_review_status=pending and notify admins once on transition.
 * Also re-enters review from rejected after the driver fixes missing/bad docs.
 * Closes desync where getMyStatus returns step=review without drivers.status='review'
 * (listPending only filters status=review).
 * @returns true if status transitioned into review this call
 */
export async function ensureDriverEnteredReview(driverId: string): Promise<boolean> {
  const [driver] = await db
    .select({
      id: drivers.id,
      status: drivers.status,
      admin_reviewed_at: drivers.admin_reviewed_at,
      admin_review_notes: drivers.admin_review_notes,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!driver) return false;
  if (HARD_TERMINAL_DRIVER_STATUSES.has(driver.status)) return false;
  if (driver.status === 'review') return false;

  const docsList = await db
    .select({ doc_type: driverDocuments.doc_type })
    .from(driverDocuments)
    .where(
      and(
        eq(driverDocuments.driver_id, driverId),
        ne(driverDocuments.status, 'superseded'),
        ne(driverDocuments.status, 'rejected'),
      ),
    );

  if (!hasAllRequiredDocs(docsList)) {
    logger.info('[DOCS] Docs incomplete — not entering review / notifying admin', {
      driverId,
      uploaded: docsList.map((d) => d.doc_type).sort(),
      missing: missingRequiredDocTypes(docsList),
    });
    return false;
  }

  let veh: { vehicle_type: string | null; insurance_coverage_type: string | null } | undefined;
  /** When true, insurance_coverage_type col is absent — do not treat as user missing coverage. */
  let coverageColMissing = false;
  try {
    const [row] = await db
      .select({
        vehicle_type: vehicles.vehicle_type,
        insurance_coverage_type: vehicles.insurance_coverage_type,
      })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driverId))
      .limit(1);
    veh = row;
  } catch (err) {
    if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
    coverageColMissing = true;
    logger.warn('[DOCS] schema drift — insurance_coverage_type missing; skip coverage gate', {
      driverId: driverId.split('-')[0],
      message: (err as Error).message,
    });
    const [row] = await db
      .select({ vehicle_type: vehicles.vehicle_type })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driverId))
      .limit(1);
    veh = row ? { vehicle_type: row.vehicle_type, insurance_coverage_type: null } : undefined;
  }

  if (
    !coverageColMissing &&
    !hasValidMotoInsuranceCoverage(veh?.vehicle_type, veh?.insurance_coverage_type)
  ) {
    logger.info('[DOCS] Moto missing insurance coverage — not entering review', {
      driverId,
      vehicle_type: veh?.vehicle_type ?? null,
      insurance_coverage_type: veh?.insurance_coverage_type ?? null,
    });
    return false;
  }

  const fromRejected = driver.status === 'rejected';
  const isResubmit =
    fromRejected || driver.admin_reviewed_at != null || !!driver.admin_review_notes?.trim();

  const pendingDocs = await db
    .select({ id: driverDocuments.id })
    .from(driverDocuments)
    .where(
      and(eq(driverDocuments.driver_id, driverId), eq(driverDocuments.status, 'pending_review')),
    )
    .limit(1);

  await db
    .update(drivers)
    .set({
      status: 'review',
      admin_review_status: 'pending',
      ...(fromRejected
        ? {
            admin_review_notes: null,
            admin_reviewed_by: null,
            admin_reviewed_at: null,
            // Ops badge: there are (or will be) docs to re-check after hard reject.
            documents_pending_review: true,
          }
        : pendingDocs.length > 0
          ? { documents_pending_review: true }
          : {}),
      updated_at: new Date(),
    })
    .where(eq(drivers.id, driverId));

  logger.info('[DOCS] Driver entered review queue', {
    driverId: driverId.split('-')[0],
    previousStatus: driver.status,
    isResubmit,
  });

  if (isResubmit) {
    void notifyAdminsDriverDocsResubmitted(driverId, { fromStatus: driver.status });
  } else {
    void notifyAdminNewDriver(driverId);
  }
  return true;
}

export const driversService = {
  async getPublicProfile(driverId: string) {
    const rows = await db
      .select({
        id: drivers.id,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        rating_avg: drivers.rating_avg,
        total_trips: drivers.total_trips,
        kyc_status: drivers.kyc_status,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        color: vehicles.color,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundError('Driver not found');

    return {
      id: row.id,
      full_name: row.full_name ? row.full_name.split(' ')[0] : row.full_name,
      avatar_url: row.avatar_url,
      rating_avg: row.rating_avg,
      total_trips: row.total_trips,
      kyc_verified: row.kyc_status === 'approved',
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
      },
    };
  },

  // Single source of truth for "where is this driver in onboarding". The mobile
  // app routes purely off `step`, and the flow is KYC-gated: a driver cannot
  // reach `vehicle`/`documents` until `kyc_status === 'approved'`. Returned
  // steps: profile → kyc → vehicle → documents → review → approved.
  async getMyStatus(user: AuthUser) {
    const statusBaseSelect = {
      id: drivers.id,
      status: drivers.status,
      kyc_status: drivers.kyc_status,
      admin_review_status: drivers.admin_review_status,
      admin_review_notes: drivers.admin_review_notes,
      documents_pending_review: drivers.documents_pending_review,
      identification_status: drivers.identification_status,
      approved_at: drivers.approved_at,
      admin_reviewed_at: drivers.admin_reviewed_at,
      created_at: drivers.created_at,
      municipality_status: drivers.municipality_status,
      address_line: drivers.address_line,
      address_resolved_city: drivers.address_resolved_city,
      address_resolved_province: drivers.address_resolved_province,
      intended_district_id: drivers.intended_district_id,
    };

    type StatusDriverRow = {
      id: string;
      status: string;
      kyc_status: string | null;
      admin_review_status: string;
      admin_review_notes: string | null;
      documents_pending_review: boolean | null;
      identification_status: string | null;
      approved_at: Date | null;
      admin_reviewed_at: Date | null;
      created_at: Date;
      municipality_status: string | null;
      address_line: string | null;
      address_resolved_city: string | null;
      address_resolved_province: string | null;
      intended_district_id: string | null;
      license_category: string | null;
      license_professional_status: string | null;
      professional_license_grace_started_at: Date | null;
      professional_license_due_at: Date | null;
    };

    let driver: StatusDriverRow | undefined;
    try {
      const [row] = await db
        .select({
          ...statusBaseSelect,
          license_category: drivers.license_category,
          license_professional_status: drivers.license_professional_status,
          professional_license_grace_started_at: drivers.professional_license_grace_started_at,
          professional_license_due_at: drivers.professional_license_due_at,
        })
        .from(drivers)
        .where(eq(drivers.user_id, user.id))
        .limit(1);
      driver = row;
    } catch (err) {
      if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
      logger.warn('[drivers] getMyStatus schema drift — retry without license columns', {
        userId: user.id.slice(0, 8),
        message: (err as Error).message,
      });
      const [row] = await db
        .select(statusBaseSelect)
        .from(drivers)
        .where(eq(drivers.user_id, user.id))
        .limit(1);
      driver = row ? { ...row, ...EMPTY_PROFESSIONAL_LICENSE_ROW } : undefined;
    }

    // No driver row yet → user must complete their profile (step1).
    if (!driver) {
      return {
        status: 'pending',
        step: 'profile',
        kyc_status: 'pending',
        municipality_status: 'unset' as const,
        address_line: null,
        address_resolved_city: null,
        address_resolved_province: null,
        intended_district_id: null,
        intended_district_name: null,
        has_district: false,
        show_municipality_waitlist_banner: false,
      };
    }

    const municipalityFields = await this.buildMunicipalityStatusFields(driver);

    const documentsPendingReview = driver.documents_pending_review;
    const identificationStatus = driver.identification_status;
    const identification = evaluateIdentificationDeadline({
      identification_status: identificationStatus,
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
    const professionalLicenseFields = {
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
    };
    const waitlisted = municipalityFields.municipality_status === 'waitlisted';
    const canGoOnline =
      driver.status === 'approved' &&
      !documentsPendingReview &&
      !identification.blocks_online &&
      !waitlisted;

    // Terminal admin states.
    if (driver.status === 'suspended') {
      return {
        status: 'suspended',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
        identification_status: identificationStatus,
        identification_phase: identification.phase,
        identification_blocks_online: true,
        identification_show_reminder: identification.show_reminder,
        identification_days_until_pause: identification.days_until_pause,
        identification_pause_at: identification.pause_at,
        can_go_online: false,
        ...professionalLicenseFields,
        ...municipalityFields,
      };
    }
    if (driver.status === 'approved') {
      const district = await this.getMyDistrict(user);
      return {
        status: 'approved',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
        identification_status: identificationStatus,
        identification_phase: identification.phase,
        identification_blocks_online: identification.blocks_online,
        identification_show_reminder: identification.show_reminder,
        identification_days_until_pause: identification.days_until_pause,
        identification_pause_at: identification.pause_at,
        identification_days_since_approval: identification.days_since_approval,
        can_go_online: canGoOnline && !!district,
        district: district ?? undefined,
        ...professionalLicenseFields,
        ...municipalityFields,
        has_district: !!district,
      };
    }
    if (driver.status === 'kyc_pending') {
      return {
        status: 'pending',
        step: 'kyc',
        kyc_status: driver.kyc_status,
        ...municipalityFields,
      };
    }

    if (driver.status === 'kyc_approved') {
      // fall through to vehicle check
    }

    // KYC gate: identity must be verified before anything else.
    // But NOT if the driver is still in step1 (profile) — let them
    // complete their profile data before demanding KYC.
    // Rejected drivers already passed KYC — skip to docs repair path below.
    if (
      driver.kyc_status !== 'approved' &&
      driver.status !== 'step1' &&
      driver.status !== 'rejected' &&
      driver.admin_review_status !== 'rejected'
    ) {
      // DIDIT is still processing → keep the user on the waiting screen.
      if (driver.kyc_status === 'in_progress' || driver.kyc_status === 'under_review') {
        return {
          status: 'under_review',
          step: 'kyc',
          kyc_status: driver.kyc_status,
          ...municipalityFields,
        };
      }
      // pending / rejected / expired → user must (re)start verification.
      return {
        status: 'pending',
        step: 'kyc',
        kyc_status: driver.kyc_status,
        ...municipalityFields,
      };
    }

    // KYC approved (or rejected-after-review repair) — vehicle required next.
    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id))
      .limit(1);

    if (!vehicle) {
      return {
        status: 'pending',
        step: 'vehicle',
        kyc_status: 'approved',
        ...municipalityFields,
      };
    }

    // Vehicle done — load valid + rejected docs for repair UX.
    const allCurrentDocs = await db
      .select({
        doc_type: driverDocuments.doc_type,
        status: driverDocuments.status,
      })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    const validDocs = allCurrentDocs.filter((d) => d.status !== 'rejected');
    const rejectedDocTypes = allCurrentDocs
      .filter((d) => d.status === 'rejected')
      .map((d) => d.doc_type);
    const missingDocTypes = missingRequiredDocTypes(validDocs);
    const docsComplete = hasAllRequiredDocs(validDocs);

    let vehicleRow: {
      vehicle_type: string | null;
      insurance_coverage_type: string | null;
    } | null = null;
    let coverageColMissing = false;
    try {
      const [row] = await db
        .select({
          vehicle_type: vehicles.vehicle_type,
          insurance_coverage_type: vehicles.insurance_coverage_type,
        })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driver.id))
        .limit(1);
      vehicleRow = row ?? null;
    } catch (err) {
      if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
      coverageColMissing = true;
      logger.warn(
        '[drivers] getMyStatus schema drift — insurance_coverage_type missing; skip coverage gate',
        {
          driverId: driver.id.slice(0, 8),
          message: (err as Error).message,
        },
      );
      const [row] = await db
        .select({ vehicle_type: vehicles.vehicle_type })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driver.id))
        .limit(1);
      vehicleRow = row ? { vehicle_type: row.vehicle_type, insurance_coverage_type: null } : null;
    }
    const motoCoverageOk =
      coverageColMissing ||
      hasValidMotoInsuranceCoverage(vehicleRow?.vehicle_type, vehicleRow?.insurance_coverage_type);
    const docsAndCoverageComplete = docsComplete && motoCoverageOk;

    // Rejected driver: re-enter review when docs complete; else documents step.
    if (driver.status === 'rejected' || driver.admin_review_status === 'rejected') {
      if (docsAndCoverageComplete) {
        await ensureDriverEnteredReview(driver.id);
        const [fresh] = await db
          .select({
            status: drivers.status,
            documents_pending_review: drivers.documents_pending_review,
            admin_review_notes: drivers.admin_review_notes,
          })
          .from(drivers)
          .where(eq(drivers.id, driver.id))
          .limit(1);

        if (fresh?.status === 'review') {
          return {
            status: 'under_review',
            step: 'review',
            kyc_status: driver.kyc_status,
            documents_pending_review: fresh.documents_pending_review ?? documentsPendingReview,
            admin_review_notes: fresh.admin_review_notes ?? null,
            missing_doc_types: [],
            rejected_doc_types: [],
            ...municipalityFields,
          };
        }
      }

      return {
        status: 'rejected',
        step: 'documents',
        kyc_status: driver.kyc_status,
        admin_review_notes: driver.admin_review_notes,
        missing_doc_types: missingDocTypes,
        rejected_doc_types: rejectedDocTypes,
        ...municipalityFields,
      };
    }

    if (!docsAndCoverageComplete) {
      return {
        status: 'pending',
        step: 'documents',
        kyc_status: 'approved',
        missing_doc_types: missingDocTypes,
        rejected_doc_types: rejectedDocTypes,
        admin_review_notes: driver.admin_review_notes ?? null,
        ...municipalityFields,
      };
    }

    // Reconcile DB status so admin pending queue (status=review) matches mobile step.
    await ensureDriverEnteredReview(driver.id);

    const [fresh] = await db
      .select({ documents_pending_review: drivers.documents_pending_review })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);

    // Everything submitted — awaiting admin review.
    // Expose soft correction notes (request_changes) so the driver can re-upload
    // without a terminal reject.
    return {
      status: 'under_review',
      step: 'review',
      kyc_status: 'approved',
      documents_pending_review: fresh?.documents_pending_review ?? documentsPendingReview,
      admin_review_notes: driver.admin_review_notes ?? null,
      ...municipalityFields,
    };
  },

  async toggleOnline(user: AuthUser, isOnline: boolean) {
    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        is_online: drivers.is_online,
        documents_pending_review: drivers.documents_pending_review,
        district_id: drivers.district_id,
        municipality_status: drivers.municipality_status,
        identification_status: drivers.identification_status,
        approved_at: drivers.approved_at,
        admin_reviewed_at: drivers.admin_reviewed_at,
        created_at: drivers.created_at,
        platform_debt: drivers.platform_debt,
        commission_fraud_block: drivers.commission_fraud_block,
        license_professional_status: drivers.license_professional_status,
        professional_license_grace_started_at: drivers.professional_license_grace_started_at,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    if (isOnline && driver.documents_pending_review) {
      throw new AppError(
        'No podes conectarte: tenes documentos pendientes de revision.',
        409,
        'DOCUMENTS_UNDER_REVIEW',
      );
    }

    if (isOnline && driver.status !== 'approved') {
      throw new AppError('Todavia no estas aprobado para conectarte.', 403, 'DRIVER_NOT_APPROVED');
    }

    if (isOnline && driver.municipality_status === 'waitlisted') {
      throw new AppError(
        'Tu municipio todavía no está habilitado para hacer viajes. Te avisamos cuando abramos tu zona.',
        403,
        'MUNICIPALITY_NOT_ENABLED',
      );
    }

    if (isOnline && !driver.district_id) {
      throw new AppError(
        'Debes seleccionar un municipio antes de conectarte.',
        400,
        'DISTRICT_REQUIRED',
      );
    }

    if (isOnline) {
      const identification = evaluateIdentificationDeadline({
        identification_status: driver.identification_status,
        approved_at: driver.approved_at,
        admin_reviewed_at: driver.admin_reviewed_at,
        created_at: driver.created_at,
      });

      if (identification.phase === 'revoked') {
        throw new AppError(
          'Tu identificación fue revocada. Contactá a soporte o tránsito de tu municipio.',
          409,
          'STICKERS_REVOKED',
        );
      }

      if (identification.phase === 'paused') {
        // Force offline if somehow still marked online past the pause window.
        if (driver.is_online) {
          await db
            .update(drivers)
            .set({ is_online: false, last_heartbeat: null, updated_at: new Date() })
            .where(eq(drivers.id, driver.id));
        }
        throw new AppError(
          'Tu cuenta está suspendida: pasaron 30 días sin retirar los stickers / identificación en tránsito. Retiralos para reactivar la cuenta.',
          409,
          'STICKERS_PICKUP_OVERDUE',
        );
      }

      await enforceCommissionDebtCap({
        driverId: driver.id,
        userId: user.id,
        platformDebt: Number(driver.platform_debt ?? 0),
        commissionFraudBlock: Boolean(driver.commission_fraud_block),
        isOnline: Boolean(driver.is_online),
        notifyOnBlock: true,
      });
    }

    const now = new Date();
    // PRODUCT LOCK: 60d professional carnet grace starts on first successful online.
    // One-shot is enforced in DB (WHERE started_at IS NULL), not only in-memory.
    const mayStartGrace =
      isOnline &&
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: true,
        license_professional_status: driver.license_professional_status,
        professional_license_grace_started_at: driver.professional_license_grace_started_at,
      });

    await db
      .update(drivers)
      .set({
        is_online: isOnline,
        // Explicit "Desconectarse" clears the last-seen signal so the
        // grace-period branch in findNearbyDrivers can't keep matching this
        // driver after they went offline on purpose.
        ...(isOnline ? {} : { last_heartbeat: null }),
        updated_at: now,
      })
      .where(eq(drivers.id, driver.id));

    let graceStartedAt: string | null = null;
    let graceDueAt: string | null = null;

    if (mayStartGrace) {
      const gracePatch = buildGraceStartPatch(now);
      const stamped = await db
        .update(drivers)
        .set({
          professional_license_grace_started_at: gracePatch.professional_license_grace_started_at,
          professional_license_due_at: gracePatch.professional_license_due_at,
          updated_at: now,
        })
        .where(
          and(
            eq(drivers.id, driver.id),
            eq(drivers.license_professional_status, 'pending_professional'),
            isNull(drivers.professional_license_grace_started_at),
          ),
        )
        .returning({
          professional_license_grace_started_at: drivers.professional_license_grace_started_at,
          professional_license_due_at: drivers.professional_license_due_at,
        });

      if (stamped[0]?.professional_license_grace_started_at) {
        graceStartedAt = stamped[0].professional_license_grace_started_at.toISOString();
        graceDueAt = stamped[0].professional_license_due_at?.toISOString() ?? null;
      } else {
        // Race loser: another writer already stamped — expose existing clock.
        const [row] = await db
          .select({
            professional_license_grace_started_at: drivers.professional_license_grace_started_at,
            professional_license_due_at: drivers.professional_license_due_at,
          })
          .from(drivers)
          .where(eq(drivers.id, driver.id))
          .limit(1);
        graceStartedAt = row?.professional_license_grace_started_at?.toISOString() ?? null;
        graceDueAt = row?.professional_license_due_at?.toISOString() ?? null;
      }
    }

    return {
      is_online: isOnline,
      message: isOnline ? 'Driver is now online' : 'Driver is now offline',
      ...(graceStartedAt
        ? {
            professional_license_grace_started_at: graceStartedAt,
            professional_license_due_at: graceDueAt,
          }
        : {}),
    };
  },

  async heartbeat(user: AuthUser, body?: { lat?: number; lng?: number; heading?: number }) {
    const [driver] = await db
      .select({
        id: drivers.id,
        is_online: drivers.is_online,
        identification_status: drivers.identification_status,
        approved_at: drivers.approved_at,
        admin_reviewed_at: drivers.admin_reviewed_at,
        created_at: drivers.created_at,
        platform_debt: drivers.platform_debt,
        commission_fraud_block: drivers.commission_fraud_block,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    const identification = evaluateIdentificationDeadline({
      identification_status: driver.identification_status,
      approved_at: driver.approved_at,
      admin_reviewed_at: driver.admin_reviewed_at,
      created_at: driver.created_at,
    });

    // Past 30d without stickers → force offline even if they were online during grace.
    if (driver.is_online && identification.blocks_online) {
      await db
        .update(drivers)
        .set({ is_online: false, last_heartbeat: null, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
      throw new AppError(
        identification.phase === 'revoked'
          ? 'Tu identificación fue revocada. Contactá a soporte o tránsito de tu municipio.'
          : 'Tu cuenta está suspendida: pasaron 30 días sin retirar los stickers / identificación en tránsito. Retiralos para reactivar la cuenta.',
        409,
        identification.phase === 'revoked' ? 'STICKERS_REVOKED' : 'STICKERS_PICKUP_OVERDUE',
      );
    }

    if (driver.is_online) {
      await enforceCommissionDebtCap({
        driverId: driver.id,
        userId: user.id,
        platformDebt: Number(driver.platform_debt ?? 0),
        commissionFraudBlock: Boolean(driver.commission_fraud_block),
        isOnline: true,
        notifyOnBlock: false,
      });
    }

    const now = new Date();

    await db.update(drivers).set({ last_heartbeat: now }).where(eq(drivers.id, driver.id));

    if (body?.lat != null && body?.lng != null) {
      await upsertLocation(driver.id, body.lat, body.lng, body.heading);
    }

    return { ok: true };
  },

  async updateProfile(
    user: AuthUser,
    data: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      vehicle_plate?: string;
      vehicle_brand?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      vehicle_year?: number;
      vehicle_type?: string;
      vehicle_engine_cc?: number | null;
      vehicle_insurance_coverage_type?: string | null;
      license_category?: string;
      license_professional_status?: string;
      photo_url?: string;
      address_line?: string;
      address_lat?: number;
      address_lng?: number;
      address_place_id?: string;
    },
  ) {
    let existing:
      | {
          id: string;
          status: string;
          kyc_status: string | null;
          license_category: string | null;
          license_professional_status: string | null;
          professional_license_grace_started_at: Date | null;
          professional_license_due_at: Date | null;
        }
      | undefined;
    try {
      const [row] = await db
        .select({
          id: drivers.id,
          status: drivers.status,
          kyc_status: drivers.kyc_status,
          license_category: drivers.license_category,
          license_professional_status: drivers.license_professional_status,
          professional_license_grace_started_at: drivers.professional_license_grace_started_at,
          professional_license_due_at: drivers.professional_license_due_at,
        })
        .from(drivers)
        .where(eq(drivers.user_id, user.id))
        .limit(1);
      existing = row;
    } catch (err) {
      if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
      logger.warn('[drivers] updateProfile schema drift — retry without license columns', {
        userId: user.id.slice(0, 8),
        message: (err as Error).message,
      });
      const [row] = await db
        .select({
          id: drivers.id,
          status: drivers.status,
          kyc_status: drivers.kyc_status,
        })
        .from(drivers)
        .where(eq(drivers.user_id, user.id))
        .limit(1);
      existing = row
        ? {
            ...row,
            license_category: null,
            license_professional_status: 'unknown',
            professional_license_grace_started_at: null,
            professional_license_due_at: null,
          }
        : undefined;
    }

    let driverId: string;
    const kycStatus = existing?.kyc_status ?? 'pending';

    if (existing) {
      driverId = existing.id;
    } else {
      const [newDriver] = await db
        .insert(drivers)
        .values({
          user_id: user.id,
          status: 'step1',
        })
        .returning({ id: drivers.id });

      if (!newDriver) throw new AppError('Failed to create driver profile', 500, 'INTERNAL_ERROR');
      driverId = newDriver.id;
    }

    if (data.first_name || data.last_name) {
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');
      await db
        .update(users)
        .set({ full_name: fullName, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    if (data.phone) {
      const phone = data.phone.trim();

      const [existingPhoneOwner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, phone), ne(users.id, user.id)))
        .limit(1);

      if (existingPhoneOwner) {
        logger.warn(
          `Phone ${phone} already belongs to user ${existingPhoneOwner.id}; skipping save for user ${user.id}`,
        );
      } else {
        const [currentUser] = await db
          .select({ phone: users.phone })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        if (currentUser?.phone !== phone) {
          await db
            .update(users)
            .set({ phone, updated_at: new Date() })
            .where(eq(users.id, user.id));
        }
      }
    }

    if (data.photo_url !== undefined && data.photo_url !== null) {
      const photoUrl = data.photo_url.trim();
      if (!photoUrl) {
        throw new AppError('URL de foto inválida.', 400, 'AVATAR_URL_INVALID');
      }
      // Only accept URLs we can map back to driver-documents storage paths
      // (blocks arbitrary remote hosts). Empty/null is ignored — never clears avatar.
      const storagePath = _storage.extractStoragePath(photoUrl);
      if (!storagePath || !storagePath.startsWith('avatars/')) {
        throw new AppError(
          'La foto de perfil debe subirse desde la app.',
          400,
          'AVATAR_URL_INVALID',
        );
      }
      await db
        .update(users)
        .set({ avatar_url: photoUrl, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    const hasVehicleData = !!(
      data.vehicle_brand ||
      data.vehicle_model ||
      data.vehicle_color ||
      data.vehicle_plate ||
      data.vehicle_year
    );

    // KYC gate first: vehicle registration always requires identity verified.
    if (hasVehicleData && kycStatus !== 'approved') {
      throw new AppError(
        'Debes completar la verificacion de identidad (KYC) antes de cargar el vehiculo',
        400,
        'KYC_REQUIRED',
      );
    }

    let municipalityResult: MunicipalityResolveResult | null = null;
    if (data.address_line !== undefined) {
      const addressLine = data.address_line.trim();
      if (addressLine.length < MIN_ADDRESS_LENGTH) {
        throw new AppError(
          'Ingresá un domicilio válido (calle y localidad).',
          400,
          'ADDRESS_REQUIRED',
        );
      }
      municipalityResult = await this.resolveMunicipalityFromAddress({
        address_line: addressLine,
        address_lat: data.address_lat,
        address_lng: data.address_lng,
      });
      await db
        .update(drivers)
        .set({
          address_line: municipalityResult.address_line,
          address_lat: municipalityResult.address_lat,
          address_lng: municipalityResult.address_lng,
          address_resolved_city: municipalityResult.address_resolved_city,
          address_resolved_province: municipalityResult.address_resolved_province,
          municipality_status: municipalityResult.municipality_status,
          intended_district_id: municipalityResult.intended_district_id,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driverId));
    }

    // After saving profile data, advance from 'step1' so the KYC gate in
    // getMyStatus will route to 'kyc' instead of 'vehicle' prematurely.
    // Require address + avatar when leaving step1 (profile completion path).
    const wasStep1 = !existing || existing.status === 'step1';
    const isProfileCompletion =
      wasStep1 &&
      !hasVehicleData &&
      !!(data.first_name || data.last_name || data.phone || data.photo_url || data.address_line);
    if (isProfileCompletion) {
      if (!municipalityResult) {
        const [addrCheck] = await db
          .select({ address_line: drivers.address_line })
          .from(drivers)
          .where(eq(drivers.id, driverId))
          .limit(1);
        if (!addrCheck?.address_line) {
          throw new AppError('Ingresá tu domicilio para continuar.', 400, 'ADDRESS_REQUIRED');
        }
      }

      const [avatarCheck] = await db
        .select({ avatar_url: users.avatar_url })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!avatarCheck?.avatar_url) {
        throw new AppError(
          'Sacá una foto de perfil con la cámara para continuar.',
          400,
          'AVATAR_REQUIRED',
        );
      }

      await db
        .update(drivers)
        .set({ status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driverId));
    }

    if (hasVehicleData) {
      if (data.vehicle_year === undefined || data.vehicle_year === null) {
        throw new AppError('Ingresá el año del vehículo.', 400, 'VEHICLE_YEAR_INVALID');
      }
      assertVehicleYear(data.vehicle_year);

      let existingVehicle:
        | {
            id: string;
            vehicle_type: string;
            engine_cc: number | null;
            insurance_coverage_type: string | null;
          }
        | undefined;
      try {
        const [row] = await db
          .select({
            id: vehicles.id,
            vehicle_type: vehicles.vehicle_type,
            engine_cc: vehicles.engine_cc,
            insurance_coverage_type: vehicles.insurance_coverage_type,
          })
          .from(vehicles)
          .where(eq(vehicles.driver_id, driverId))
          .limit(1);
        existingVehicle = row;
      } catch (err) {
        if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
        logger.warn('[drivers] updateProfile schema drift — vehicle cols missing on select', {
          driverId: driverId.slice(0, 8),
          message: (err as Error).message,
        });
        const [row] = await db
          .select({
            id: vehicles.id,
            vehicle_type: vehicles.vehicle_type,
          })
          .from(vehicles)
          .where(eq(vehicles.driver_id, driverId))
          .limit(1);
        existingVehicle = row
          ? { ...row, engine_cc: null, insurance_coverage_type: null }
          : undefined;
      }

      // Prefer request type → existing row → car. Never silently downgrade moto→car on partial PUT.
      const vehicleType =
        (data.vehicle_type && String(data.vehicle_type).trim()) ||
        existingVehicle?.vehicle_type ||
        'car';

      const engineCcInput =
        data.vehicle_engine_cc !== undefined
          ? data.vehicle_engine_cc
          : isMotoVehicleType(vehicleType)
            ? (existingVehicle?.engine_cc ?? null)
            : null;
      const engineCc = assertVehicleEngineCc(engineCcInput, vehicleType);

      const coverageInput =
        data.vehicle_insurance_coverage_type !== undefined
          ? data.vehicle_insurance_coverage_type
          : isMotoVehicleType(vehicleType)
            ? (existingVehicle?.insurance_coverage_type ?? null)
            : null;
      const insuranceCoverageType = assertInsuranceCoverageForVehicle(coverageInput, vehicleType);

      const vehicleCore = {
        driver_id: driverId,
        brand: data.vehicle_brand ?? '',
        model: data.vehicle_model ?? '',
        year: data.vehicle_year,
        color: data.vehicle_color ?? '',
        plate: data.vehicle_plate ?? '',
        vehicle_type: vehicleType,
      };
      const vehicleValues = {
        ...vehicleCore,
        engine_cc: engineCc,
        insurance_coverage_type: insuranceCoverageType,
      };

      const writeVehicle = async (withExtendedCols: boolean) => {
        const values = withExtendedCols ? vehicleValues : vehicleCore;
        if (existingVehicle) {
          await db.update(vehicles).set(values).where(eq(vehicles.id, existingVehicle.id));
        } else {
          await db.insert(vehicles).values(values);
        }
      };

      try {
        await writeVehicle(true);
      } catch (err) {
        if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
        logger.warn(
          '[drivers] updateProfile schema drift — writing vehicle without engine_cc/coverage',
          {
            driverId: driverId.slice(0, 8),
            message: (err as Error).message,
          },
        );
        // Moto rules still enforced in-process; DB just cannot store yet until migration.
        await writeVehicle(false);
      }
    } else if (data.vehicle_insurance_coverage_type !== undefined) {
      // Chip-only PUT from docs step (vehicle already registered).
      const [existingVehicle] = await db
        .select({
          id: vehicles.id,
          vehicle_type: vehicles.vehicle_type,
        })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driverId))
        .limit(1);

      if (!existingVehicle) {
        throw new AppError(
          'Guardá el vehículo antes de elegir la cobertura del seguro.',
          400,
          'VEHICLE_REQUIRED',
        );
      }

      const insuranceCoverageType = assertInsuranceCoverageForVehicle(
        data.vehicle_insurance_coverage_type,
        existingVehicle.vehicle_type,
        { required: isMotoVehicleType(existingVehicle.vehicle_type) },
      );

      try {
        await db
          .update(vehicles)
          .set({
            insurance_coverage_type: insuranceCoverageType,
            updated_at: new Date(),
          })
          .where(eq(vehicles.id, existingVehicle.id));
      } catch (err) {
        if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
        throw new AppError(
          'El backend aún no tiene la columna de cobertura del seguro. Aplicá la migración 0051 en wabdd.',
          503,
          'SCHEMA_MIGRATION_REQUIRED',
        );
      }

      await ensureDriverEnteredReview(driverId);
    }

    // License category / professional carnet status (A1.2/A1.3/A1.4 moto ANSV, B/professional auto).
    // Also re-enter on moto vehicle writes so stored class is re-checked against new cc/type.
    if (
      data.license_category != null ||
      data.license_professional_status != null ||
      hasVehicleData
    ) {
      const [veh] = await db
        .select({
          vehicle_type: vehicles.vehicle_type,
          engine_cc: vehicles.engine_cc,
        })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driverId))
        .limit(1);
      // Prefer request → DB vehicle → same-request vehicle upsert default.
      const vehicleType =
        (data.vehicle_type && String(data.vehicle_type).trim()) ||
        veh?.vehicle_type ||
        (hasVehicleData ? (data.vehicle_type ?? 'car') : null) ||
        null;
      const isMoto = isMotoVehicleType(vehicleType);

      // Vehicle-only auto PUT: no license fields to touch.
      if (
        data.license_category == null &&
        data.license_professional_status == null &&
        !(hasVehicleData && isMoto)
      ) {
        // fall through — no license patch
      } else {
        const normalizeCategory = (raw: string) =>
          isMoto
            ? normalizeMotoLicenseCategory(raw)
            : String(raw).trim().toUpperCase() || String(raw).trim();

        // Request wins; else reuse DB so status-only / cc-only can still resolve + soft-heal.
        const requestCategory =
          data.license_category != null
            ? normalizeCategory(String(data.license_category))
            : undefined;
        const dbCategoryRaw = existing?.license_category ?? null;
        const dbCategory =
          dbCategoryRaw != null && String(dbCategoryRaw).trim()
            ? normalizeCategory(String(dbCategoryRaw))
            : null;
        const category =
          requestCategory !== undefined ? requestCategory : (dbCategory ?? undefined);

        // explicit_status alone does not need vehicle type; category resolve does.
        if (
          data.license_professional_status == null &&
          category &&
          (!vehicleType || !String(vehicleType).trim())
        ) {
          throw new AppError(
            'Guardá el vehículo (Auto/Moto) antes de la categoría de licencia.',
            400,
            'VEHICLE_TYPE_REQUIRED',
          );
        }

        const engineCc =
          data.vehicle_engine_cc != null
            ? Number(data.vehicle_engine_cc)
            : veh?.engine_cc != null
              ? Number(veh.engine_cc)
              : null;

        // Hard-validate when client sends category, or moto vehicle/cc is being written.
        const mustValidateMotoClass =
          isMoto &&
          !!category &&
          (data.license_category != null || hasVehicleData || data.vehicle_engine_cc != null);

        let canonicalMotoCategory: string | undefined;
        let writeCategory = data.license_category != null;

        if (mustValidateMotoClass) {
          canonicalMotoCategory = assertMotoLicenseMatchesEngineCc(category, engineCc);
          writeCategory = true;
        } else if (isMoto && category && !isAllowedMotoLicenseCategory(category)) {
          // Stale out-of-product token in DB (e.g. bare "A1") — clear so driver re-declares.
          if (data.license_category == null) {
            canonicalMotoCategory = undefined;
            writeCategory = true;
            // force null write below via empty category path
          }
        } else if (isMoto && category && isAllowedMotoLicenseCategory(category)) {
          // Status-only (or no cc yet): soft-heal legacy A2/A3/A4 → A1.x when band matches.
          const canonical = normalizeMotoLicenseCategory(category);
          if (
            engineCc != null &&
            Number.isInteger(engineCc) &&
            motoLicenseMatchesEngineCc(canonical, engineCc)
          ) {
            canonicalMotoCategory = canonical;
            if (canonical !== String(dbCategoryRaw ?? '').trim()) writeCategory = true;
          } else if (canonical !== String(dbCategoryRaw ?? '').trim()) {
            // Alias normalize without cc (e.g. A2 → A1.2) — heal token only.
            canonicalMotoCategory = canonical;
            writeCategory = true;
          }
        }

        const effectiveCategoryForStatus =
          isMoto &&
          category &&
          !isAllowedMotoLicenseCategory(category) &&
          data.license_category == null
            ? null
            : (canonicalMotoCategory ?? category ?? null);

        const status = resolveLicenseProfessionalStatus({
          vehicle_type: vehicleType,
          // Prefer validated/healed class; else request/DB category; explicit_status still wins inside helper.
          license_category: effectiveCategoryForStatus,
          explicit_status: data.license_professional_status ?? null,
        });

        if (
          data.license_professional_status == null &&
          effectiveCategoryForStatus &&
          status === 'unknown' &&
          (!vehicleType || !String(vehicleType).trim())
        ) {
          throw new AppError(
            'Guardá el vehículo (Auto/Moto) antes de la categoría de licencia.',
            400,
            'VEHICLE_TYPE_REQUIRED',
          );
        }

        // Status-only with explicit status and no category anywhere: still persist status.
        const shouldWriteStatus =
          data.license_professional_status != null ||
          data.license_category != null ||
          writeCategory ||
          (hasVehicleData && isMoto && !!category);

        if (shouldWriteStatus) {
          const prevStatus = existing?.license_professional_status ?? null;
          const licensePatch: {
            license_category?: string | null;
            license_professional_status: string;
            professional_license_grace_started_at?: null;
            professional_license_due_at?: null;
            updated_at: Date;
          } = {
            license_professional_status: status,
            updated_at: new Date(),
          };
          if (writeCategory) {
            if (
              isMoto &&
              category &&
              !isAllowedMotoLicenseCategory(category) &&
              data.license_category == null
            ) {
              licensePatch.license_category = null;
            } else {
              licensePatch.license_category = (canonicalMotoCategory ?? category) || null;
            }
          }
          // Clear grace only on pending → professional/not_required transition.
          if (shouldClearProfessionalGraceTimestamps(prevStatus, status)) {
            licensePatch.professional_license_grace_started_at = null;
            licensePatch.professional_license_due_at = null;
          }

          try {
            await db.update(drivers).set(licensePatch).where(eq(drivers.id, driverId));
          } catch (err) {
            if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
            // Same posture as insurance chip-only PUT: never 200 while discarding license.
            throw new AppError(
              'El backend aún no tiene las columnas de licencia. Aplicá la migración 0049 en wabdd.',
              503,
              'SCHEMA_MIGRATION_REQUIRED',
            );
          }
        }
      }
    }

    const result = await this.getMyStatus(user);
    return {
      id: driverId,
      status: result.status,
      step: result.step,
      message: 'Profile updated',
      municipality_status: result.municipality_status,
      intended_district_id: result.intended_district_id,
      intended_district_name: result.intended_district_name,
      address_line: result.address_line,
      address_resolved_city: result.address_resolved_city,
      address_resolved_province: result.address_resolved_province,
    };
  },

  async addDocument(
    user: AuthUser,
    data: { doc_type: string; file_url: string; file_name?: string },
  ) {
    if (!VALID_DOC_TYPES.includes(data.doc_type)) {
      throw new AppError(`Invalid doc_type: ${data.doc_type}`, 400, 'BAD_REQUEST');
    }

    const [driver] = await db
      .select({ id: drivers.id, status: drivers.status, kyc_status: drivers.kyc_status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver profile not found. Complete step 1 first');

    // KYC gate: documents can only be uploaded after identity verification.
    if (driver.kyc_status !== 'approved') {
      throw new AppError(
        'Debes completar la verificacion de identidad (KYC) antes de subir documentos',
        400,
        'KYC_REQUIRED',
      );
    }

    await db
      .update(driverDocuments)
      .set({ status: 'superseded', superseded_at: new Date() })
      .where(
        and(
          eq(driverDocuments.driver_id, driver.id),
          eq(driverDocuments.doc_type, data.doc_type),
          ne(driverDocuments.status, 'superseded'),
        ),
      );

    await db.insert(driverDocuments).values({
      driver_id: driver.id,
      doc_type: data.doc_type,
      file_url: data.file_url,
    });

    // All required docs → review queue (listPending filters status='review').
    // getMyStatus also reconciles; call here so upload response is consistent.
    await ensureDriverEnteredReview(driver.id);

    const result = await this.getMyStatus(user);
    return { message: 'Document uploaded', status: result.status, step: result.step };
  },

  async uploadDocument(user: AuthUser, file: File, docType: string) {
    if (!VALID_DOC_TYPES.includes(docType)) {
      throw new AppError(`Invalid doc_type: ${docType}`, 400, 'BAD_REQUEST');
    }

    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        kyc_status: drivers.kyc_status,
        full_name: users.full_name,
      })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.user_id))
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver profile not found. Complete step 1 first');

    if (driver.kyc_status !== 'approved') {
      throw new AppError(
        'Debes completar la verificacion de identidad (KYC) antes de subir documentos',
        400,
        'KYC_REQUIRED',
      );
    }

    const contentType = contentTypeForFile(file);
    const path = buildDriverDocumentPath({
      fullName: driver.full_name,
      driverId: driver.id,
      docType,
      file,
    });
    const fileUrl = await _storage.uploadFile(file, path, { contentType });

    await db
      .update(driverDocuments)
      .set({ status: 'superseded', superseded_at: new Date() })
      .where(
        and(
          eq(driverDocuments.driver_id, driver.id),
          eq(driverDocuments.doc_type, docType),
          ne(driverDocuments.status, 'superseded'),
        ),
      );

    await db.insert(driverDocuments).values({
      driver_id: driver.id,
      doc_type: docType,
      file_url: fileUrl,
    });

    await ensureDriverEnteredReview(driver.id);

    return { file_url: fileUrl };
  },

  async uploadPhoto(user: AuthUser, file: File) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    const [currentUser] = await db
      .select({ avatar_url: users.avatar_url, full_name: users.full_name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const oldPath = _storage.extractStoragePath(currentUser?.avatar_url ?? null);
    if (oldPath) {
      await _storage.deleteFile(oldPath);
    }

    const contentType = contentTypeForFile(file);
    const path = buildDriverAvatarPath({
      fullName: currentUser?.full_name,
      ownerId: driver?.id ?? user.id,
      file,
    });
    const fileUrl = await _storage.uploadFile(file, path, { contentType });

    await db
      .update(users)
      .set({ avatar_url: fileUrl, updated_at: new Date() })
      .where(eq(users.id, user.id));

    return { file_url: fileUrl };
  },

  async listDocuments(user: AuthUser) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) return [];

    return db
      .select({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        status: driverDocuments.status,
        verified_at: driverDocuments.verified_at,
        expires_at: driverDocuments.expires_at,
        created_at: driverDocuments.created_at,
      })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      )
      .orderBy(driverDocuments.created_at);
  },

  // Re-upload of a document the driver already registered. Each upload is a NEW
  // row (the previous one is marked `superseded`, never overwritten) so an admin
  // can always compare before/after. If the doc_type is sensitive, the driver is
  // pushed back into the admin review queue and forced offline until approved.
  async reuploadDocument(user: AuthUser, file: File, docType: string) {
    if (!VALID_DOC_TYPES.includes(docType)) {
      throw new AppError(`Invalid doc_type: ${docType}`, 400, 'BAD_REQUEST');
    }

    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        full_name: users.full_name,
      })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.user_id))
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver profile not found. Complete onboarding first');

    // Delete previous file from storage before uploading the new one.
    // Best-effort: if deletion fails we log and continue — the old file becomes
    // orphaned but the re-upload itself is not blocked.
    const [previousDoc] = await db
      .select({ file_url: driverDocuments.file_url })
      .from(driverDocuments)
      .where(
        and(
          eq(driverDocuments.driver_id, driver.id),
          eq(driverDocuments.doc_type, docType),
          ne(driverDocuments.status, 'superseded'),
        ),
      )
      .limit(1);

    if (previousDoc) {
      const storagePath = _storage.extractStoragePath(previousDoc.file_url);
      if (storagePath) {
        try {
          await _storage.deleteFile(storagePath);
        } catch (err) {
          logger.warn('[DOCS] Failed to delete previous doc from storage', {
            driverId: driver.id,
            docType,
            path: storagePath,
            error: (err as Error).message,
          });
        }
      }
    }

    const contentType = contentTypeForFile(file);
    const path = buildDriverDocumentPath({
      fullName: driver.full_name,
      driverId: driver.id,
      docType,
      file,
    });
    const fileUrl = await _storage.uploadFile(file, path, { contentType });

    // Supersede any prior non-superseded doc of the same type.
    await db
      .update(driverDocuments)
      .set({ status: 'superseded', superseded_at: new Date() })
      .where(
        and(
          eq(driverDocuments.driver_id, driver.id),
          eq(driverDocuments.doc_type, docType),
          ne(driverDocuments.status, 'superseded'),
        ),
      );

    const [doc] = await db
      .insert(driverDocuments)
      .values({
        driver_id: driver.id,
        doc_type: docType,
        file_url: fileUrl,
        status: 'pending_review',
      })
      .returning({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        status: driverDocuments.status,
      });

    if (!doc) throw new AppError('Failed to upload document', 400, 'BAD_REQUEST');

    const isSensitive = SENSITIVE_DOC_TYPES.has(docType);

    if (isSensitive) {
      if (driver.status === 'rejected') {
        // Coming from hard reject: only re-enter review when the full required set is valid again.
        // ensure notifies resubmit on transition.
        await ensureDriverEnteredReview(driver.id);
      } else {
        const previousStatus = driver.status;
        await db
          .update(drivers)
          .set({
            status: 'review',
            admin_review_status: 'pending',
            documents_pending_review: true,
            is_online: false,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, driver.id));

        logger.info('[DOCS] Sensitive doc re-uploaded, driver back in review', {
          driverId: driver.id.split('-')[0],
          docType,
          previousStatus,
        });

        // Already in ops loop (review / approved / soft notes): resubmit copy, not "alta nueva".
        void notifyAdminsDriverDocsResubmitted(driver.id, {
          docTypes: [docType],
          fromStatus: previousStatus,
        });
      }
    } else if (driver.status === 'rejected') {
      await ensureDriverEnteredReview(driver.id);
    }

    return {
      id: doc.id,
      doc_type: doc.doc_type,
      file_url: doc.file_url,
      status: doc.status,
      requires_review: isSensitive,
    };
  },

  async setDistrict(user: AuthUser, districtId: string) {
    return await db.transaction(async (tx) => {
      const [driver] = await tx
        .select({
          id: drivers.id,
          status: drivers.status,
          district_id: drivers.district_id,
        })
        .from(drivers)
        .where(eq(drivers.user_id, user.id))
        .for('update')
        .limit(1);

      if (!driver) throw new NotFoundError('Driver profile not found');
      if (driver.status !== 'approved') {
        throw new AppError('Debes estar aprobado para elegir un municipio', 400, 'NOT_APPROVED');
      }
      if (driver.district_id) {
        throw new AppError(
          'Ya tenes un municipio asignado y no se puede cambiar',
          409,
          'DISTRICT_ALREADY_SET',
        );
      }

      const [district] = await tx
        .select({
          id: districts.id,
          name: districts.name,
          province: districts.province,
          terms_and_conditions: districts.terms_and_conditions,
        })
        .from(districts)
        .where(and(eq(districts.id, districtId), eq(districts.status, 'active')))
        .limit(1);

      if (!district || !district.terms_and_conditions) {
        throw new AppError('Municipio no encontrado o no disponible', 404, 'DISTRICT_NOT_FOUND');
      }

      await tx
        .update(drivers)
        .set({ district_id: districtId, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));

      return {
        district_id: district.id,
        district_name: district.name,
        district_province: district.province,
      };
    });
  },

  async getMyDistrict(
    user: AuthUser,
  ): Promise<{ id: string; name: string; province: string } | null> {
    const [driver] = await db
      .select({ district_id: drivers.district_id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver?.district_id) return null;

    const [district] = await db
      .select({ id: districts.id, name: districts.name, province: districts.province })
      .from(districts)
      .where(eq(districts.id, driver.district_id))
      .limit(1);

    return district ?? null;
  },

  async getMyProfile(user: AuthUser) {
    const profileBaseSelect = {
      phone: users.phone,
      email: users.email,
      full_name: users.full_name,
      avatar_url: users.avatar_url,
      id: drivers.id,
      user_id: drivers.user_id,
      status: drivers.status,
      kyc_status: drivers.kyc_status,
      rating_avg: drivers.rating_avg,
      total_trips: drivers.total_trips,
      completion_rate: drivers.completion_rate,
      is_online: drivers.is_online,
      documents_pending_review: drivers.documents_pending_review,
      created_at: drivers.created_at,
      address_line: drivers.address_line,
      address_lat: drivers.address_lat,
      address_lng: drivers.address_lng,
      address_resolved_city: drivers.address_resolved_city,
      address_resolved_province: drivers.address_resolved_province,
      municipality_status: drivers.municipality_status,
      intended_district_id: drivers.intended_district_id,
      brand: vehicles.brand,
      model: vehicles.model,
      year: vehicles.year,
      color: vehicles.color,
      plate: vehicles.plate,
      vehicle_type: vehicles.vehicle_type,
    };

    let row:
      | (typeof profileBaseSelect extends never
          ? never
          : {
              phone: string | null;
              email: string | null;
              full_name: string | null;
              avatar_url: string | null;
              id: string | null;
              user_id: string | null;
              status: string | null;
              kyc_status: string | null;
              rating_avg: number | null;
              total_trips: number | null;
              completion_rate: number | null;
              is_online: boolean | null;
              documents_pending_review: boolean | null;
              created_at: Date | null;
              address_line: string | null;
              address_lat: number | null;
              address_lng: number | null;
              address_resolved_city: string | null;
              address_resolved_province: string | null;
              municipality_status: string | null;
              intended_district_id: string | null;
              brand: string | null;
              model: string | null;
              year: number | null;
              color: string | null;
              plate: string | null;
              vehicle_type: string | null;
              license_category: string | null;
              license_professional_status: string | null;
              professional_license_grace_started_at: Date | null;
              professional_license_due_at: Date | null;
              engine_cc: number | null;
              insurance_coverage_type: string | null;
            })
      | undefined;

    try {
      const rows = await db
        .select({
          ...profileBaseSelect,
          license_category: drivers.license_category,
          license_professional_status: drivers.license_professional_status,
          professional_license_grace_started_at: drivers.professional_license_grace_started_at,
          professional_license_due_at: drivers.professional_license_due_at,
          engine_cc: vehicles.engine_cc,
          insurance_coverage_type: vehicles.insurance_coverage_type,
        })
        .from(users)
        .leftJoin(drivers, eq(users.id, drivers.user_id))
        .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
        .where(eq(users.id, user.id))
        .limit(1);
      row = rows[0];
    } catch (err) {
      if (!isMissingOnboardingVehicleSchemaError(err)) throw err;
      logger.warn('[drivers] getMyProfile schema drift — retry without license/vehicle extras', {
        userId: user.id.slice(0, 8),
        message: (err as Error).message,
      });
      const rows = await db
        .select(profileBaseSelect)
        .from(users)
        .leftJoin(drivers, eq(users.id, drivers.user_id))
        .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
        .where(eq(users.id, user.id))
        .limit(1);
      const base = rows[0];
      row = base
        ? {
            ...base,
            ...EMPTY_PROFESSIONAL_LICENSE_ROW,
            engine_cc: null,
            insurance_coverage_type: null,
          }
        : undefined;
    }

    if (!row || !row.id) {
      return {
        step: 'step1',
        message: 'Onboarding not started',
        avatar_url: row?.avatar_url ?? null,
      };
    }

    const [tripStats] = await db
      .select({ total_trips: count() })
      .from(trips)
      .where(and(eq(trips.driver_id, row.id), eq(trips.status, 'completed')));

    return {
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      status: row.status,
      kyc_status: row.kyc_status,
      rating_avg: row.rating_avg,
      total_trips: tripStats?.total_trips ?? 0,
      completion_rate: row.completion_rate,
      is_online: row.is_online,
      documents_pending_review: row.documents_pending_review,
      address_line: row.address_line,
      address_lat: row.address_lat,
      address_lng: row.address_lng,
      address_resolved_city: row.address_resolved_city,
      address_resolved_province: row.address_resolved_province,
      municipality_status: row.municipality_status ?? 'unset',
      intended_district_id: row.intended_district_id,
      license_category: row.license_category ?? null,
      license_professional_status: row.license_professional_status ?? 'unknown',
      professional_license_grace_started_at: row.professional_license_grace_started_at
        ? row.professional_license_grace_started_at.toISOString()
        : null,
      professional_license_due_at: row.professional_license_due_at
        ? row.professional_license_due_at.toISOString()
        : null,
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
        plate: row.plate,
        vehicle_type: row.vehicle_type,
        engine_cc: row.engine_cc ?? null,
        insurance_coverage_type: row.insurance_coverage_type ?? null,
      },
      created_at: row.created_at ? row.created_at.toISOString() : null,
    };
  },

  async buildMunicipalityStatusFields(driver: {
    municipality_status: string | null;
    address_line: string | null;
    address_resolved_city: string | null;
    address_resolved_province: string | null;
    intended_district_id: string | null;
  }) {
    const municipality_status = (driver.municipality_status ?? 'unset') as
      | 'unset'
      | 'operational'
      | 'waitlisted';

    let intended_district_name: string | null = null;
    if (driver.intended_district_id) {
      const [d] = await db
        .select({ name: districts.name })
        .from(districts)
        .where(eq(districts.id, driver.intended_district_id))
        .limit(1);
      intended_district_name = d?.name ?? null;
    }

    return {
      municipality_status,
      address_line: driver.address_line ?? null,
      address_resolved_city: driver.address_resolved_city ?? null,
      address_resolved_province: driver.address_resolved_province ?? null,
      intended_district_id: driver.intended_district_id ?? null,
      intended_district_name,
      has_district: false as boolean,
      show_municipality_waitlist_banner: municipality_status === 'waitlisted',
    };
  },

  async resolveMunicipalityFromAddress(input: {
    address_line: string;
    address_lat?: number;
    address_lng?: number;
  }): Promise<MunicipalityResolveResult> {
    const addressLine = input.address_line.trim();
    let lat: number | null = input.address_lat ?? null;
    let lng: number | null = input.address_lng ?? null;
    let city: string | null = null;
    let province: string | null = null;

    const geo = await geocode(lat != null && lng != null ? { lat, lng } : { address: addressLine });

    lat = geo.lat;
    lng = geo.lng;
    city = geo.city ?? null;
    province = geo.province ?? null;

    if (!city) {
      const parsed = parseLocalityFromFormatted(geo.formatted_address || addressLine);
      city = parsed.city;
      province = province ?? parsed.province;
    }

    if (!city && !province) {
      const fromLine = parseLocalityFromFormatted(addressLine);
      city = fromLine.city;
      province = fromLine.province;
    }

    if (lat == null || lng == null) {
      throw new AppError(
        'No pudimos ubicar ese domicilio. Probá con calle, altura y localidad.',
        400,
        'ADDRESS_UNRESOLVABLE',
      );
    }

    const activeDistricts = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
      })
      .from(districts)
      .where(eq(districts.status, 'active'));

    const match = matchDistrict(city, province, activeDistricts);
    return buildMunicipalityResult(addressLine, { lat, lng, city, province }, match);
  },

  async getPayoutInfo(user: AuthUser) {
    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    const database = getDb();
    const [alias, cvu, holder, bank, debtCap] = await Promise.all([
      getConfig(database, 'platform.lifty_payout_alias'),
      getConfig(database, 'platform.lifty_payout_cvu'),
      getConfig(database, 'platform.lifty_payout_holder'),
      getConfig(database, 'platform.lifty_payout_bank'),
      getDebtCapArs(database),
    ]);

    return {
      alias: alias || null,
      cvu: cvu || null,
      holder: holder || null,
      bank: bank || null,
      platform_debt: Math.round(Number(driver.platform_debt ?? 0)),
      debt_cap_ars: debtCap,
    };
  },

  async listCommissionReceipts(user: AuthUser) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    const rows = await db
      .select({
        id: driverCommissionReceipts.id,
        amount_ars: driverCommissionReceipts.amount_ars,
        debt_before_ars: driverCommissionReceipts.debt_before_ars,
        status: driverCommissionReceipts.status,
        created_at: driverCommissionReceipts.created_at,
        file_url: driverCommissionReceipts.file_url,
      })
      .from(driverCommissionReceipts)
      .where(eq(driverCommissionReceipts.driver_id, driver.id))
      .orderBy(desc(driverCommissionReceipts.created_at));

    return rows.map((r) => ({
      id: r.id,
      amount_ars: r.amount_ars,
      debt_before_ars: r.debt_before_ars,
      status: r.status,
      created_at: r.created_at?.toISOString?.() ?? r.created_at,
      file_url: r.file_url,
    }));
  },

  async submitCommissionReceipt(user: AuthUser, file: File, amountRaw: number | string) {
    const [driver] = await db
      .select({
        id: drivers.id,
        platform_debt: drivers.platform_debt,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    // Fast-fail validations (re-checked under row lock inside the tx).
    const debtHint = Math.round(Number(driver.platform_debt ?? 0));
    if (debtHint <= 0) {
      throw new AppError('No tenés deuda de comisión pendiente.', 400, 'NO_COMMISSION_DEBT');
    }

    const amount = parseAmountArs(amountRaw);
    if (amount < debtHint) {
      throw new AppError(
        `El monto debe ser al menos $${debtHint} (tu deuda actual).`,
        400,
        'AMOUNT_BELOW_DEBT',
      );
    }

    const [pending] = await db
      .select({ id: driverCommissionReceipts.id })
      .from(driverCommissionReceipts)
      .where(
        and(
          eq(driverCommissionReceipts.driver_id, driver.id),
          eq(driverCommissionReceipts.status, 'pending_review'),
        ),
      )
      .limit(1);

    if (pending) {
      throw new AppError('Ya tenés un comprobante pendiente de revisión.', 409, 'RECEIPT_PENDING');
    }

    const database = getDb();
    const [alias, cvu] = await Promise.all([
      getConfig(database, 'platform.lifty_payout_alias'),
      getConfig(database, 'platform.lifty_payout_cvu'),
    ]);
    if (!alias.trim() && !cvu.trim()) {
      throw new AppError(
        'Lifty todavía no configuró la cuenta de cobro. Probá más tarde.',
        503,
        'PAYOUT_ACCOUNT_NOT_CONFIGURED',
      );
    }

    const contentType = contentTypeForFile(file);
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (!allowed.has(contentType)) {
      throw new AppError(
        'Formato no soportado. Usá foto (JPEG/PNG/WebP) o PDF.',
        400,
        'INVALID_FILE_TYPE',
      );
    }

    const [userRow] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const path = buildCommissionReceiptPath({
      fullName: userRow?.full_name,
      driverId: driver.id,
      file,
    });
    const fileUrl = await _storage.uploadFile(file, path, { contentType });

    const cleanupUpload = async () => {
      try {
        const storagePath = _storage.extractStoragePath(fileUrl) ?? path;
        await _storage.deleteFile(storagePath);
      } catch (cleanupErr) {
        logger.warn('[drivers] commission receipt orphan cleanup failed', {
          path,
          error: (cleanupErr as Error).message,
        });
      }
    };

    try {
      const receipt = await db.transaction(async (tx) => {
        // Lock driver row so concurrent collect cannot raise debt under us.
        const locked = await tx.execute<{ platform_debt: number | string }>(
          sql`SELECT platform_debt FROM drivers WHERE id = ${driver.id} FOR UPDATE`,
        );
        const lockedRows =
          (locked as { rows?: Array<{ platform_debt: number | string }> }).rows ??
          (Array.isArray(locked) ? (locked as Array<{ platform_debt: number | string }>) : []);
        const lockedDebt = Math.round(Number(lockedRows[0]?.platform_debt ?? 0));

        if (lockedDebt <= 0) {
          throw new AppError('No tenés deuda de comisión pendiente.', 400, 'NO_COMMISSION_DEBT');
        }
        if (amount < lockedDebt) {
          throw new AppError(
            `El monto debe ser al menos $${lockedDebt} (tu deuda actual).`,
            400,
            'AMOUNT_BELOW_DEBT',
          );
        }

        const [row] = await tx
          .insert(driverCommissionReceipts)
          .values({
            driver_id: driver.id,
            amount_ars: amount,
            debt_before_ars: lockedDebt,
            file_url: fileUrl,
            status: 'pending_review',
          })
          .returning({
            id: driverCommissionReceipts.id,
            amount_ars: driverCommissionReceipts.amount_ars,
            debt_before_ars: driverCommissionReceipts.debt_before_ars,
            status: driverCommissionReceipts.status,
            created_at: driverCommissionReceipts.created_at,
            file_url: driverCommissionReceipts.file_url,
          });

        // Clear debt only after amount ≥ locked debt. Never clear commission_fraud_block
        // here — pack 4 / admin must lift fraud after review.
        await tx
          .update(drivers)
          .set({
            platform_debt: 0,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, driver.id));

        return row;
      });

      return {
        receipt: {
          id: receipt.id,
          amount_ars: receipt.amount_ars,
          debt_before_ars: receipt.debt_before_ars,
          status: receipt.status,
          created_at: receipt.created_at?.toISOString?.() ?? receipt.created_at,
          file_url: receipt.file_url,
        },
        platform_debt: 0,
      };
    } catch (err) {
      await cleanupUpload();
      if (err instanceof AppError) throw err;
      if (isUniqueViolation(err)) {
        throw new AppError(
          'Ya tenés un comprobante pendiente de revisión.',
          409,
          'RECEIPT_PENDING',
        );
      }
      throw err;
    }
  },
};
