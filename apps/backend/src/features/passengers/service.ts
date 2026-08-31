import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { passengerProfiles, users } from '../../shared/db/schema';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

export const passengersService = {
  async register(userId: string, phone?: string, fullName?: string) {
    const trimmedName = fullName?.trim() || null;
    if (trimmedName) {
      await db
        .update(users)
        .set({ full_name: trimmedName, updated_at: new Date() })
        .where(eq(users.id, userId));
    }

    if (phone?.trim()) {
      const phoneTrimmed = phone.trim();
      const [owner] = await db
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (owner && !owner.phone) {
        const [taken] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phone, phoneTrimmed), ne(users.id, userId)))
          .limit(1);
        if (!taken) {
          await db
            .update(users)
            .set({ phone: phoneTrimmed, updated_at: new Date() })
            .where(eq(users.id, userId));
        }
      }
    }

    const [existing] = await db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, userId))
      .limit(1);

    if (existing) {
      if (phone && !existing.phone) {
        const [updated] = await db
          .update(passengerProfiles)
          .set({ phone })
          .where(eq(passengerProfiles.user_id, userId))
          .returning();
        return updated;
      }
      return existing;
    }

    const [created] = await db
      .insert(passengerProfiles)
      .values({ user_id: userId, phone: phone ?? null })
      .returning();

    return created;
  },

  async getProfile(user: AuthUser) {
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
      .where(eq(passengerProfiles.user_id, user.id))
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
    if (data.full_name) {
      await db
        .update(users)
        .set({ full_name: data.full_name.trim(), updated_at: new Date() })
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

        await db
          .update(passengerProfiles)
          .set({ phone, updated_at: new Date() })
          .where(eq(passengerProfiles.user_id, user.id));
      }
    }

    return this.getProfile(user);
  },
};
