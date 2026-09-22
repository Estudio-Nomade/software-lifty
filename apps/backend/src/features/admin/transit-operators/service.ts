import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../../shared/db/client';
import { districts, drivers, passengerProfiles, users } from '../../../shared/db/schema';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../../shared/lib/errors';
import { logger } from '../../../shared/lib/logger';
import { getAuthAdminClient, getAuthPasswordClient } from './auth-admin';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Same rules as web-transito login (`NFKC` + trim) so admin reset matches panel sign-in. */
function normalizePassword(password: string): string {
  return password.normalize('NFKC').trim();
}

function assertPassword(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new BadRequestError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  }
  if (/\s/.test(password)) {
    throw new BadRequestError('La contraseña no puede contener espacios');
  }
}

function assertEmail(email: string) {
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestError('Email inválido');
  }
}

/**
 * Prove the password actually works with Supabase Auth password grant.
 * Admin updateUserById can return OK while grant still fails (wrong project key, lag, etc.).
 */
async function verifyPasswordGrant(email: string, password: string): Promise<void> {
  try {
    const client = getAuthPasswordClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) {
      const msg = error?.message ?? 'password grant failed';
      logger.error('[transit-operators] password grant verify failed', { email, message: msg });
      throw new ServiceUnavailableError(
        'Auth no aceptó la contraseña nueva. Reintentá el reset; si sigue, revisá SUPABASE_* en el API.',
      );
    }
    // Drop the probe session — operator will sign in from the panel.
    await client.auth.signOut().catch(() => undefined);
  } catch (err) {
    if (err instanceof AppError) throw err;
    authAdminFail(err);
  }
}

async function requireActiveDistrict(districtId: string) {
  const [row] = await db
    .select({ id: districts.id, name: districts.name, status: districts.status })
    .from(districts)
    .where(eq(districts.id, districtId))
    .limit(1);

  if (!row) throw new NotFoundError('Municipio no encontrado');
  if (row.status !== 'active') throw new BadRequestError('Municipio inactivo');
  return row;
}

async function assertDistrictFree(districtId: string, exceptUserId?: string) {
  const filters = [eq(users.role, 'transit'), eq(users.transit_district_id, districtId)];
  if (exceptUserId) filters.push(ne(users.id, exceptUserId));

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...filters))
    .limit(1);

  if (existing) {
    throw new ConflictError('Este municipio ya tiene un operador de tránsito');
  }
}

async function scrubDriverPassengerRows(userId: string) {
  await db.delete(drivers).where(eq(drivers.user_id, userId));
  await db.delete(passengerProfiles).where(eq(passengerProfiles.user_id, userId));
}

function authAdminFail(err: unknown): never {
  const message = err instanceof Error ? err.message : 'Auth Admin error';
  logger.error('[transit-operators] Auth Admin failed', { message });
  throw new ServiceUnavailableError('No se pudo completar la operación en Auth');
}

export const transitOperatorsService = {
  async listDistricts() {
    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
      })
      .from(districts)
      .where(eq(districts.status, 'active'))
      .orderBy(districts.name);

    return { items: rows };
  },

  async listOperators() {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        transit_district_id: users.transit_district_id,
        district_name: districts.name,
        created_at: users.created_at,
      })
      .from(users)
      .leftJoin(districts, eq(users.transit_district_id, districts.id))
      .where(eq(users.role, 'transit'))
      .orderBy(desc(users.created_at));

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        transit_district_id: r.transit_district_id,
        district_name: r.district_name ?? null,
        created_at: r.created_at,
        banned: false,
      })),
    };
  },

  async createOperator(
    input: { district_id: string; email: string; password: string; full_name?: string },
    actorId: string,
  ) {
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    assertEmail(email);
    assertPassword(password);

    const district = await requireActiveDistrict(input.district_id);
    await assertDistrictFree(input.district_id);

    const [emailTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (emailTaken) throw new ConflictError('El email ya está en uso');

    const fullName = input.full_name?.trim() || `Tránsito ${district.name}`;

    let authUserId: string;
    try {
      const admin = getAuthAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'transit' },
        user_metadata: { full_name: fullName, role: 'transit' },
      });
      if (error || !data.user?.id) {
        const msg = error?.message?.toLowerCase() ?? '';
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          throw new ConflictError('El email ya existe en Auth');
        }
        authAdminFail(error ?? new Error('createUser sin user'));
      }
      authUserId = data.user.id;
    } catch (err) {
      if (err instanceof AppError) throw err;
      authAdminFail(err);
    }

    try {
      await db
        .insert(users)
        .values({
          id: authUserId,
          email,
          role: 'transit',
          full_name: fullName,
          transit_district_id: input.district_id,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            role: 'transit',
            full_name: fullName,
            transit_district_id: input.district_id,
            updated_at: new Date(),
          },
        });

      await scrubDriverPassengerRows(authUserId);
      await verifyPasswordGrant(email, password);
    } catch (err) {
      try {
        const admin = getAuthAdminClient();
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        /* best-effort rollback */
      }
      throw err;
    }

    logger.info('[transit-operators] created', {
      operatorId: authUserId,
      districtId: input.district_id,
      actorId,
    });

    return {
      id: authUserId,
      email,
      full_name: fullName,
      transit_district_id: input.district_id,
      district_name: district.name,
      password,
      created_at: new Date().toISOString(),
    };
  },

  async patchOperator(
    userId: string,
    input: { district_id?: string; full_name?: string },
    actorId: string,
  ) {
    const [op] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!op || op.role !== 'transit') throw new NotFoundError('Operador no encontrado');

    const set: Partial<typeof users.$inferInsert> = { updated_at: new Date() };
    let districtName: string | null = null;

    if (input.district_id) {
      const district = await requireActiveDistrict(input.district_id);
      await assertDistrictFree(input.district_id, userId);
      set.transit_district_id = input.district_id;
      districtName = district.name;
    }

    if (input.full_name !== undefined) {
      set.full_name = input.full_name.trim() || null;
    }

    if (Object.keys(set).length <= 1) {
      throw new BadRequestError('Nada para actualizar');
    }

    const [updated] = await db.update(users).set(set).where(eq(users.id, userId)).returning({
      id: users.id,
      email: users.email,
      full_name: users.full_name,
      transit_district_id: users.transit_district_id,
      created_at: users.created_at,
    });

    if (districtName == null && updated.transit_district_id) {
      const [d] = await db
        .select({ name: districts.name })
        .from(districts)
        .where(eq(districts.id, updated.transit_district_id))
        .limit(1);
      districtName = d?.name ?? null;
    }

    logger.info('[transit-operators] patched', {
      operatorId: userId,
      districtId: updated.transit_district_id,
      actorId,
    });

    return {
      id: updated.id,
      email: updated.email,
      full_name: updated.full_name,
      transit_district_id: updated.transit_district_id,
      district_name: districtName,
      created_at: updated.created_at,
    };
  },

  async resetPassword(userId: string, passwordRaw: string, actorId: string) {
    const password = normalizePassword(passwordRaw);
    assertPassword(password);

    const [op] = await db
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!op || op.role !== 'transit') throw new NotFoundError('Operador no encontrado');
    if (!op.email) throw new BadRequestError('El operador no tiene email en users');

    const email = normalizeEmail(op.email);

    try {
      const admin = getAuthAdminClient();
      // Force email_confirm so a previously-unconfirmed account can still log in after reset.
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        app_metadata: { role: 'transit' },
      });
      if (error) authAdminFail(error);
      if (!data.user?.id) authAdminFail(new Error('updateUserById sin user'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      authAdminFail(err);
    }

    // Must succeed against the same Auth host the panels use — otherwise UI would
    // show "updated" while tránsito still gets invalid_credentials.
    await verifyPasswordGrant(email, password);

    logger.info('[transit-operators] password reset', {
      operatorId: userId,
      actorId,
    });

    return {
      id: userId,
      email,
      password,
      message:
        'Contraseña actualizada y verificada en Auth. Guardala ahora; no se vuelve a mostrar.',
    };
  },

  async disableOperator(userId: string, actorId: string) {
    const [op] = await db
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!op || op.role !== 'transit') throw new NotFoundError('Operador no encontrado');

    try {
      const admin = getAuthAdminClient();
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      if (error) authAdminFail(error);
    } catch (err) {
      if (err instanceof AppError) throw err;
      authAdminFail(err);
    }

    // Drop transit grant so /auth/me is no longer role=transit (ban alone is not enough for panels).
    await db
      .update(users)
      .set({
        transit_district_id: null,
        role: 'driver',
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));
    await scrubDriverPassengerRows(userId);

    logger.info('[transit-operators] disabled', {
      operatorId: userId,
      actorId,
    });

    return { id: userId, email: op.email, banned: true };
  },
};
