import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { passengerProfiles } from '../../shared/db/schema';
import type { AuthUser } from '../../shared/middleware/auth';

export const passengersService = {
  async register(userId: string) {
    const [existing] = await db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, userId))
      .limit(1);

    if (existing) return existing;

    const [created] = await db.insert(passengerProfiles).values({ user_id: userId }).returning();

    return created;
  },

  async getProfile(user: AuthUser) {
    const [profile] = await db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, user.id))
      .limit(1);

    return profile ?? null;
  },
};
