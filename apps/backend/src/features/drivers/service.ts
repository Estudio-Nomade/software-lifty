import { and, count, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  districts,
  driverDocuments,
  driverLocations,
  drivers,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import {
  VALID_DOC_TYPES as CANONICAL_VALID_DOC_TYPES,
  DOC_TYPES,
} from '../../shared/lib/documents';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { evaluateIdentificationDeadline } from '../../shared/lib/identification-deadline';
import { logger } from '../../shared/lib/logger';
import {
  type StorageProvider,
  buildDriverAvatarPath,
  buildDriverDocumentPath,
  contentTypeForFile,
  supabaseStorage,
} from '../../shared/lib/storage';

let _storage: StorageProvider = supabaseStorage;

export function setStorageForTesting(sp: StorageProvider) {
  _storage = sp;
}
import { geocode } from '../../shared/lib/geo';
import type { AuthUser } from '../../shared/middleware/auth';
import { notifyAdminNewDriver } from '../admin/notifications';
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

const TERMINAL_DRIVER_STATUSES = new Set(['approved', 'rejected', 'suspended']);

/**
 * Idempotent: if all required docs are present and the driver is not terminal,
 * set status=review + admin_review_status=pending and notify admins once on transition.
 * Closes desync where getMyStatus returns step=review without drivers.status='review'
 * (listPending only filters status=review).
 * @returns true if status transitioned into review this call
 */
export async function ensureDriverEnteredReview(driverId: string): Promise<boolean> {
  const [driver] = await db
    .select({ id: drivers.id, status: drivers.status })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!driver) return false;
  if (TERMINAL_DRIVER_STATUSES.has(driver.status)) return false;
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
      missing: DOC_TYPES.filter((t) => !docsList.some((d) => d.doc_type === t)),
    });
    return false;
  }

  await db
    .update(drivers)
    .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
    .where(eq(drivers.id, driverId));

  logger.info('[DOCS] Driver entered review queue', {
    driverId: driverId.split('-')[0],
    previousStatus: driver.status,
  });

  void notifyAdminNewDriver(driverId);
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
    const [driver] = await db
      .select({
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
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

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
        ...municipalityFields,
        has_district: !!district,
      };
    }
    if (driver.status === 'rejected' || driver.admin_review_status === 'rejected') {
      return {
        status: 'rejected',
        step: 'review',
        kyc_status: driver.kyc_status,
        admin_review_notes: driver.admin_review_notes,
        ...municipalityFields,
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
    if (driver.kyc_status !== 'approved' && driver.status !== 'step1') {
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

    // KYC approved — vehicle required next.
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

    // Vehicle done — documents required next.
    const docsList = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(
          eq(driverDocuments.driver_id, driver.id),
          ne(driverDocuments.status, 'superseded'),
          ne(driverDocuments.status, 'rejected'),
        ),
      );

    if (!hasAllRequiredDocs(docsList)) {
      return {
        status: 'pending',
        step: 'documents',
        kyc_status: 'approved',
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
    return {
      status: 'under_review',
      step: 'review',
      kyc_status: 'approved',
      documents_pending_review: fresh?.documents_pending_review ?? documentsPendingReview,
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
    }

    await db
      .update(drivers)
      .set({
        is_online: isOnline,
        // Explicit "Desconectarse" clears the last-seen signal so the
        // grace-period branch in findNearbyDrivers can't keep matching this
        // driver after they went offline on purpose.
        ...(isOnline ? {} : { last_heartbeat: null }),
        updated_at: new Date(),
      })
      .where(eq(drivers.id, driver.id));

    return {
      is_online: isOnline,
      message: isOnline ? 'Driver is now online' : 'Driver is now offline',
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
      photo_url?: string;
      address_line?: string;
      address_lat?: number;
      address_lng?: number;
      address_place_id?: string;
    },
  ) {
    const [existing] = await db
      .select({ id: drivers.id, status: drivers.status, kyc_status: drivers.kyc_status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

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

    if (data.photo_url) {
      await db
        .update(users)
        .set({ avatar_url: data.photo_url, updated_at: new Date() })
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
    // Require address when leaving step1 (profile completion path).
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
      await db
        .update(drivers)
        .set({ status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driverId));
    }

    if (hasVehicleData) {
      const [existingVehicle] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driverId))
        .limit(1);

      const vehicleValues = {
        driver_id: driverId,
        brand: data.vehicle_brand ?? '',
        model: data.vehicle_model ?? '',
        year: data.vehicle_year ?? new Date().getFullYear(),
        color: data.vehicle_color ?? '',
        plate: data.vehicle_plate ?? '',
        vehicle_type: data.vehicle_type ?? 'car',
      };

      if (existingVehicle) {
        await db.update(vehicles).set(vehicleValues).where(eq(vehicles.id, existingVehicle.id));
      } else {
        await db.insert(vehicles).values(vehicleValues);
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
      });

      void notifyAdminNewDriver(driver.id);
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
    const rows = await db
      .select({
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
      })
      .from(users)
      .leftJoin(drivers, eq(users.id, drivers.user_id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .where(eq(users.id, user.id))
      .limit(1);

    const row = rows[0];

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
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
        plate: row.plate,
        vehicle_type: row.vehicle_type,
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
};
