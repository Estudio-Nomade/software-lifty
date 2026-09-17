import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts, users } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { deriveRole } from '../../shared/middleware/auth';
import type { AuthUser } from '../../shared/middleware/auth';

export const authService = {
  async getMe(user: AuthUser) {
    const [row] = await db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
        transit_district_id: users.transit_district_id,
        district_name: districts.name,
      })
      .from(users)
      .leftJoin(districts, eq(users.transit_district_id, districts.id))
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row) throw new NotFoundError('User not found');

    const role = await deriveRole(row.id);

    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      role,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      created_at: row.created_at?.toISOString() ?? null,
      transit_district_id: row.transit_district_id ?? null,
      district_name: row.district_name ?? null,
    };
  },

  async logout(user: AuthUser) {
    logger.info('[AUTH] Logout', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
