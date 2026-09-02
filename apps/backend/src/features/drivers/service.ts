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
import { DOC_TYPES } from '../../shared/lib/documents';
import { AppError, NotFoundError } from '../../shared/lib/errors';
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
import type { AuthUser } from '../../shared/middleware/auth';
import { notifyAdminNewDriver } from '../admin/notifications';
import { upsertLocation } from '../location/service';

const VALID_DOC_TYPES: readonly string[] = DOC_TYPES;

// Sensitive documents gate the driver's ability to go online: re-uploading one
// forces a fresh admin review and pauses "online" until approved. The server —
// never the client — decides sensitivity, so a driver can't dodge review by
// mislabelling a doc_type.
const SENSITIVE_DOC_TYPES = new Set<string>(DOC_TYPES);

function hasAllRequiredDocs(uploaded: { doc_type: string }[]): boolean {
  const types = new Set(uploaded.map((d) => d.doc_type));
  return DOC_TYPES.every((t) => types.has(t));
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
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    // No driver row yet → user must complete their profile (step1).
    if (!driver) {
      return { status: 'pending', step: 'profile', kyc_status: 'pending' };
    }

    const documentsPendingReview = driver.documents_pending_review;

    // Terminal admin states.
    if (driver.status === 'suspended') {
      return {
        status: 'suspended',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
      };
    }
    if (driver.status === 'approved') {
      const district = await this.getMyDistrict(user);
      return {
        status: 'approved',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
        has_district: !!district,
        district: district ?? undefined,
      };
    }
    if (driver.status === 'rejected' || driver.admin_review_status === 'rejected') {
      return {
        status: 'rejected',
        step: 'review',
        kyc_status: driver.kyc_status,
        admin_review_notes: driver.admin_review_notes,
      };
    }

    if (driver.status === 'kyc_pending') {
      return { status: 'pending', step: 'kyc', kyc_status: driver.kyc_status };
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
        return { status: 'under_review', step: 'kyc', kyc_status: driver.kyc_status };
      }
      // pending / rejected / expired → user must (re)start verification.
      return { status: 'pending', step: 'kyc', kyc_status: driver.kyc_status };
    }

    // KYC approved — vehicle required next.
    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id))
      .limit(1);

    if (!vehicle) {
      return { status: 'pending', step: 'vehicle', kyc_status: 'approved' };
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
      return { status: 'pending', step: 'documents', kyc_status: 'approved' };
    }

    // Everything submitted — awaiting admin review.
    return {
      status: 'under_review',
      step: 'review',
      kyc_status: 'approved',
      documents_pending_review: documentsPendingReview,
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

    if (isOnline && !driver.district_id) {
      throw new AppError(
        'Debes seleccionar un municipio antes de conectarte.',
        400,
        'DISTRICT_REQUIRED',
      );
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
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

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

    // After saving profile data, advance from 'step1' so the KYC gate in
    // getMyStatus will route to 'kyc' instead of 'vehicle' prematurely.
    if (existing && existing.status === 'step1') {
      await db
        .update(drivers)
        .set({ status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driverId));
    }

    const hasVehicleData =
      data.vehicle_brand ||
      data.vehicle_model ||
      data.vehicle_color ||
      data.vehicle_plate ||
      data.vehicle_year;

    // KYC gate: no vehicle can be registered until the driver's identity is
    // verified. This is what forces every driver through DIDIT — the client
    // cannot skip it by calling this endpoint directly.
    if (hasVehicleData && kycStatus !== 'approved') {
      throw new AppError(
        'Debes completar la verificacion de identidad (KYC) antes de cargar el vehiculo',
        400,
        'KYC_REQUIRED',
      );
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
    return { id: driverId, status: result.status, step: result.step, message: 'Profile updated' };
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

    // All required docs submitted → hand the driver to the admin review queue
    // (adminService.listPending filters by status = 'review').
    if (hasAllRequiredDocs(docsList) && driver.status !== 'approved') {
      await db
        .update(drivers)
        .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));

      void notifyAdminNewDriver(driver.id);
    } else if (!hasAllRequiredDocs(docsList)) {
      logger.info('[DOCS] Docs incomplete — not entering review / notifying admin', {
        driverId: driver.id,
        uploaded: docsList.map((d) => d.doc_type).sort(),
        missing: DOC_TYPES.filter((t) => !docsList.some((d) => d.doc_type === t)),
      });
    }

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

    if (hasAllRequiredDocs(docsList) && driver.status !== 'approved') {
      await db
        .update(drivers)
        .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));

      void notifyAdminNewDriver(driver.id);
    } else if (!hasAllRequiredDocs(docsList)) {
      logger.info('[DOCS] Docs incomplete — not entering review / notifying admin', {
        driverId: driver.id,
        uploaded: docsList.map((d) => d.doc_type).sort(),
        missing: DOC_TYPES.filter((t) => !docsList.some((d) => d.doc_type === t)),
      });
    }

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
};
