import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { passengerProfiles, users } from '../../shared/db/schema';
import { AppError } from '../../shared/lib/errors';
import { type StorageProvider, supabaseStorage } from '../../shared/lib/storage';
import type { AuthUser } from '../../shared/middleware/auth';

const PHONE_MAX_LEN = 20;

let _storage: StorageProvider = supabaseStorage;

export function setStorageForTesting(sp: StorageProvider) {
  _storage = sp;
}

async function ensurePassengerProfile(userId: string, phone?: string | null) {
  const [existing] = await db
    .select()
    .from(passengerProfiles)
    .where(eq(passengerProfiles.user_id, userId))
    .limit(1);

  if (existing) return existing;

  // Concurrent GET+PUT can both miss SELECT and race on INSERT.
  // onConflictDoNothing + re-SELECT avoids unique user_id 500s.
  const [created] = await db
    .insert(passengerProfiles)
    .values({ user_id: userId, phone: phone ?? null })
    .onConflictDoNothing({ target: passengerProfiles.user_id })
    .returning();

  if (created) return created;

  const [raced] = await db
    .select()
    .from(passengerProfiles)
    .where(eq(passengerProfiles.user_id, userId))
    .limit(1);

  if (!raced) {
    throw new AppError('No se pudo crear el perfil de pasajero', 500, 'INTERNAL_ERROR');
  }
  return raced;
}

export const passengersService = {
  async register(userId: string, phone?: string, fullName?: string) {
    // Same completeness contract as GET/PUT /profile: clients gate on full_name + phone.
    // Returning the raw passenger_profiles row omits full_name and breaks complete-profile.
    const trimmedName = fullName?.trim() || null;
    if (trimmedName) {
      await db
        .update(users)
        .set({ full_name: trimmedName, updated_at: new Date() })
        .where(eq(users.id, userId));
    }

    let nextPhone: string | null = null;
    if (phone !== undefined && phone !== null) {
      const phoneTrimmed = phone.trim();
      if (phoneTrimmed) {
        if (phoneTrimmed.length > PHONE_MAX_LEN) {
          throw new AppError(
            'El teléfono es demasiado largo. Usá hasta 20 caracteres.',
            400,
            'PHONE_TOO_LONG',
          );
        }

        const [taken] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phone, phoneTrimmed), ne(users.id, userId)))
          .limit(1);
        if (taken) {
          throw new AppError(
            'Ese teléfono ya está registrado en otra cuenta. Probá con otro número.',
            409,
            'PHONE_TAKEN',
          );
        }

        const [owner] = await db
          .select({ id: users.id, phone: users.phone })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (owner && owner.phone !== phoneTrimmed) {
          await db
            .update(users)
            .set({ phone: phoneTrimmed, updated_at: new Date() })
            .where(eq(users.id, userId));
        }
        nextPhone = phoneTrimmed;
      }
    }

    const existing = await ensurePassengerProfile(userId, nextPhone);

    if (nextPhone && existing.phone !== nextPhone) {
      await db
        .update(passengerProfiles)
        .set({ phone: nextPhone, updated_at: new Date() })
        .where(eq(passengerProfiles.user_id, userId));
    }

    // Always re-read from DB (same contract as GET /profile). Do not pass a
    // synthetic phone — getProfileByUserId ignores AuthUser fields other than id.
    return this.getProfileByUserId(userId);
  },

  async getProfile(user: AuthUser) {
    return this.getProfileByUserId(user.id);
  },

  /** Reads full_name/phone/email from DB only — never from a request-scoped AuthUser snapshot. */
  async getProfileByUserId(userId: string) {
    await ensurePassengerProfile(userId);

    const rows = await db
      .select({
        id: passengerProfiles.id,
        full_name: users.full_name,
        phone: users.phone,
        email: users.email,
        avatar_url: users.avatar_url,
        profile_phone: passengerProfiles.phone,
      })
      .from(passengerProfiles)
      .innerJoin(users, eq(passengerProfiles.user_id, users.id))
      .where(eq(passengerProfiles.user_id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      full_name: row.full_name,
      phone: row.phone ?? row.profile_phone,
      email: row.email,
      avatar_url: row.avatar_url,
    };
  },

  async updateProfile(user: AuthUser, data: { full_name?: string; phone?: string }) {
    await ensurePassengerProfile(user.id);

    let nextPhone: string | null = null;
    if (data.phone !== undefined) {
      const phone = data.phone.trim();
      if (!phone) {
        throw new AppError('Ingresá un número de teléfono válido.', 400, 'PHONE_REQUIRED');
      }
      if (phone.length > PHONE_MAX_LEN) {
        throw new AppError(
          'El teléfono es demasiado largo. Usá hasta 20 caracteres.',
          400,
          'PHONE_TOO_LONG',
        );
      }

      const [existingPhoneOwner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, phone), ne(users.id, user.id)))
        .limit(1);

      if (existingPhoneOwner) {
        throw new AppError(
          'Ese teléfono ya está registrado en otra cuenta. Probá con otro número.',
          409,
          'PHONE_TAKEN',
        );
      }

      nextPhone = phone;
    }

    if (data.full_name) {
      await db
        .update(users)
        .set({ full_name: data.full_name.trim(), updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    if (nextPhone) {
      const [currentUser] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (currentUser?.phone !== nextPhone) {
        await db
          .update(users)
          .set({ phone: nextPhone, updated_at: new Date() })
          .where(eq(users.id, user.id));
      }

      await db
        .update(passengerProfiles)
        .set({ phone: nextPhone, updated_at: new Date() })
        .where(eq(passengerProfiles.user_id, user.id));
    }

    return this.getProfile(user);
  },

  async uploadAvatar(user: AuthUser, file: File) {
    await ensurePassengerProfile(user.id);

    const [currentUser] = await db
      .select({ avatar_url: users.avatar_url })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const oldPath = _storage.extractStoragePath(currentUser?.avatar_url ?? null);
    if (oldPath) {
      await _storage.deleteFile(oldPath);
    }

    const path = `avatars/passenger-${user.id}-${Date.now()}`;
    const fileUrl = await _storage.uploadFile(file, path, {
      contentType: file.type || 'image/jpeg',
    });

    await db
      .update(users)
      .set({ avatar_url: fileUrl, updated_at: new Date() })
      .where(eq(users.id, user.id));

    return { file_url: fileUrl, avatar_url: fileUrl };
  },
};
