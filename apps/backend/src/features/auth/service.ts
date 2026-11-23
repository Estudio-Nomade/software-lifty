import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts, users } from '../../shared/db/schema';
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  ValidationError,
} from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { getRedis } from '../../shared/lib/redis';
import { deriveRole } from '../../shared/middleware/auth';
import type { AuthUser } from '../../shared/middleware/auth';
import { type LoginHintResult, loginHintFromAuthUser, normalizeLoginHintEmail } from './login-hint';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_HINT_EMAIL_MAX = Number(process.env.LOGIN_HINT_EMAIL_RATE_LIMIT_MAX) || 5;
const LOGIN_HINT_EMAIL_WINDOW_S =
  Math.ceil((Number(process.env.LOGIN_HINT_EMAIL_RATE_LIMIT_WINDOW_MS) || 60_000) / 1000) || 60;

type AdminUserRow = {
  email?: string | null;
  identities?: Array<{ provider?: string | null }> | null;
  app_metadata?: { providers?: string[] | null } | null;
};

/** Fetch Auth user by email via GoTrue Admin (service role). */
export async function fetchAuthUserByEmail(email: string): Promise<AdminUserRow | null> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ServiceUnavailableError(
      'Auth Admin no configurado (SUPABASE_URL + SUPABASE_SECRET_KEY)',
    );
  }

  const endpoint = `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('[AUTH] login-hint admin users failed', {
      status: res.status,
      body: body.slice(0, 200),
    });
    // Soft-fail → client keeps generic credentials copy (no leak).
    return null;
  }

  const json = (await res.json()) as { users?: AdminUserRow[] };
  const usersList = Array.isArray(json.users) ? json.users : [];
  const exact =
    usersList.find((u) => (u.email ?? '').toLowerCase() === email) ?? usersList[0] ?? null;
  return exact;
}

async function assertLoginHintEmailRateLimit(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `ratelimit:login-hint:email:${email}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, LOGIN_HINT_EMAIL_WINDOW_S);
    }
    if (count > LOGIN_HINT_EMAIL_MAX) {
      throw new TooManyRequestsError('Demasiados intentos. Esperá un momento.');
    }
  } catch (err) {
    if (err instanceof TooManyRequestsError) throw err;
    // Redis blip — rely on IP rate limit only.
  }
}

export const authService = {
  /**
   * Soft google-only hint after failed password login.
   * Always `{ googleOnly: boolean }` — missing/email/dual → false (no existence leak).
   * Never returns tokens/ids.
   */
  async getLoginHint(rawEmail: string): Promise<LoginHintResult> {
    const email = normalizeLoginHintEmail(rawEmail ?? '');
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestError('Email inválido');
    }

    await assertLoginHintEmailRateLimit(email);

    try {
      const user = await fetchAuthUserByEmail(email);
      return loginHintFromAuthUser(user);
    } catch (err) {
      if (err instanceof ServiceUnavailableError || err instanceof TooManyRequestsError) {
        throw err;
      }
      logger.warn('[AUTH] login-hint unexpected', {
        message: err instanceof Error ? err.message : String(err),
      });
      return { googleOnly: false };
    }
  },

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
        terms_accepted_at: users.terms_accepted_at,
        terms_version: users.terms_version,
        privacy_version: users.privacy_version,
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
      legal: {
        terms_version: row.terms_version ?? null,
        privacy_version: row.privacy_version ?? null,
        terms_accepted_at: row.terms_accepted_at?.toISOString() ?? null,
      },
    };
  },

  /**
   * Explicit TyC + privacy accept. Server timestamps; role from DB (not body).
   * Idempotent when same versions already stored.
   */
  async acceptLegal(
    user: AuthUser,
    body: { terms_version: string; privacy_version: string; user_type?: string },
  ) {
    const termsVersion = body.terms_version?.trim() ?? '';
    const privacyVersion = body.privacy_version?.trim() ?? '';
    if (!termsVersion || !privacyVersion) {
      throw new ValidationError('terms_version y privacy_version son requeridos');
    }

    let [existing] = await db
      .select({
        id: users.id,
        terms_version: users.terms_version,
        privacy_version: users.privacy_version,
        terms_accepted_at: users.terms_accepted_at,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Authenticated JWT must never 404 here: ensure row (same race pattern as auth middleware).
    if (!existing) {
      const roleSeed =
        body.user_type === 'passenger' || body.user_type === 'driver'
          ? body.user_type
          : user.role === 'passenger' || user.role === 'driver'
            ? user.role
            : 'driver';
      await db
        .insert(users)
        .values({
          id: user.id,
          email: user.email?.trim() || null,
          phone: user.phone?.trim() || null,
          role: roleSeed,
        })
        .onConflictDoNothing({ target: users.id });

      [existing] = await db
        .select({
          id: users.id,
          terms_version: users.terms_version,
          privacy_version: users.privacy_version,
          terms_accepted_at: users.terms_accepted_at,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (!existing) {
        throw new BadRequestError('No se pudo registrar la aceptación (perfil incompleto)');
      }
    }

    const role = await deriveRole(existing.id);
    const sameVersions =
      existing.terms_version === termsVersion && existing.privacy_version === privacyVersion;

    if (sameVersions && existing.terms_accepted_at) {
      return {
        terms_accepted_at: existing.terms_accepted_at.toISOString(),
        terms_version: existing.terms_version as string,
        privacy_version: existing.privacy_version as string,
        role,
      };
    }

    const acceptedAt = new Date();
    const [updated] = await db
      .update(users)
      .set({
        terms_accepted_at: acceptedAt,
        terms_version: termsVersion,
        privacy_version: privacyVersion,
        updated_at: acceptedAt,
      })
      .where(eq(users.id, user.id))
      .returning({
        terms_accepted_at: users.terms_accepted_at,
        terms_version: users.terms_version,
        privacy_version: users.privacy_version,
      });

    if (!updated?.terms_accepted_at) {
      throw new BadRequestError('No se pudo registrar la aceptación');
    }

    logger.info('[AUTH] legal-accept', {
      userId: user.id.split('-')[0],
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      role,
    });

    return {
      terms_accepted_at: updated.terms_accepted_at.toISOString(),
      terms_version: updated.terms_version as string,
      privacy_version: updated.privacy_version as string,
      role,
    };
  },

  async logout(user: AuthUser) {
    logger.info('[AUTH] Logout', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
