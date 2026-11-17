import { timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { accountDeletionRequests, users } from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { getRedis } from '../../shared/lib/redis';
import type { AuthUser } from '../../shared/middleware/auth';
import { WEB_GENERIC_MESSAGE, canAcceptVerify, isStaffRole, normalizeEmail } from './policy';
import { findActiveTripsForUser, processAccountDeletion } from './process';
import {
  buildVerifyLink,
  generateVerifyToken,
  hashEmail,
  hashToken,
  tokenTtlMinutes,
} from './tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WEB_EMAIL_MAX = Number(process.env.ACCOUNT_DELETION_WEB_EMAIL_RATE_MAX) || 5;
const WEB_EMAIL_WINDOW_S =
  Math.ceil((Number(process.env.ACCOUNT_DELETION_WEB_EMAIL_RATE_WINDOW_MS) || 3_600_000) / 1000) ||
  3600;

type AuthAdminUser = { id: string; email?: string | null };

async function fetchAuthUserFullByEmail(email: string): Promise<AuthAdminUser | null> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn('[account-deletion] admin lookup skipped — no secret key');
    return null;
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
    logger.warn('[account-deletion] admin users failed', { status: res.status });
    return null;
  }

  const json = (await res.json()) as { users?: AuthAdminUser[] };
  const list = Array.isArray(json.users) ? json.users : [];
  // Exact email only — never fall back to list[0] (would leak/delete wrong account).
  const exact = list.find((u) => (u.email ?? '').toLowerCase() === email) ?? null;
  if (!exact?.id) return null;
  return exact;
}

async function resolveDbUser(opts: {
  authUserId: string | null;
  email: string;
}): Promise<typeof users.$inferSelect | null> {
  if (opts.authUserId) {
    const [byId] = await db.select().from(users).where(eq(users.id, opts.authUserId)).limit(1);
    if (byId) return byId;
  }
  const [byEmail] = await db.select().from(users).where(eq(users.email, opts.email)).limit(1);
  return byEmail ?? null;
}

async function assertWebEmailRateLimit(emailHash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `ratelimit:account-deletion:email:${emailHash}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WEB_EMAIL_WINDOW_S);
    if (count > WEB_EMAIL_MAX) {
      throw new TooManyRequestsError('Demasiados intentos. Esperá un momento.');
    }
  } catch (err) {
    if (err instanceof TooManyRequestsError) throw err;
  }
}

function scheduleProcess(requestId: string) {
  // Fire-and-forget after response; tests can call process directly.
  const run = () => {
    processAccountDeletion(requestId).catch((err) => {
      logger.error('[account-deletion] process failed', {
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  };
  if (process.env.NODE_ENV === 'test') {
    // Tests drive process explicitly — do not auto-run.
    return;
  }
  if (typeof setImmediate === 'function') setImmediate(run);
  else setTimeout(run, 0);
}

async function sendVerifyEmail(email: string, token: string): Promise<void> {
  const link = buildVerifyLink(token);
  await sendEmail(
    email,
    'Lifty — confirmá la eliminación de tu cuenta',
    `<p>Recibimos un pedido para eliminar tu cuenta de Lifty.</p>
<p><a href="${link}">Confirmá la eliminación</a> (válido por ${tokenTtlMinutes()} minutos).</p>
<p>Si no fuiste vos, ignorá este email.</p>
<p>¿Problemas? admin@liftyviajes.com</p>`,
  );
}

export const accountDeletionService = {
  async requestFromApp(user: AuthUser, body: { confirm?: boolean }) {
    if (body.confirm !== true) {
      throw new BadRequestError('Debés confirmar la eliminación (confirm: true)');
    }

    if (isStaffRole(user.role)) {
      throw new ForbiddenError('Las cuentas de staff no se eliminan por este flujo');
    }

    const active = await findActiveTripsForUser(user.id);
    if (active.length > 0) {
      throw new AppError(
        'Tenés un viaje en curso. Terminá o cancelá el viaje antes de eliminar la cuenta.',
        409,
        'ACTIVE_TRIP',
      );
    }

    const email = normalizeEmail(user.email ?? '');
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestError('Tu cuenta no tiene un email válido para confirmar la eliminación');
    }

    // Resolve auth id: prefer users.id when it matches Auth; also try admin by email.
    let authUserId = user.id;
    try {
      const auth = await fetchAuthUserFullByEmail(email);
      if (auth?.id) authUserId = auth.id;
    } catch {
      /* keep user.id */
    }

    const now = new Date();
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({
        user_id: user.id,
        auth_user_id: authUserId,
        email_normalized: email,
        email_hash: hashEmail(email),
        requested_role_hint: user.role ?? null,
        source: 'app',
        status: 'requested',
        requested_at: now,
        verified_at: now,
        retention_details: { source: 'app', reauth_required_client: true },
      })
      .returning({ id: accountDeletionRequests.id, status: accountDeletionRequests.status });

    scheduleProcess(row.id);

    return {
      request_id: row.id,
      status: row.status,
      message: 'Solicitud registrada. Vamos a eliminar tu cuenta.',
    };
  },

  async getMine(user: AuthUser) {
    const [row] = await db
      .select({
        id: accountDeletionRequests.id,
        status: accountDeletionRequests.status,
        source: accountDeletionRequests.source,
        requested_at: accountDeletionRequests.requested_at,
        completed_at: accountDeletionRequests.completed_at,
        created_at: accountDeletionRequests.created_at,
      })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.user_id, user.id))
      .orderBy(desc(accountDeletionRequests.created_at))
      .limit(1);

    return { request: row ?? null };
  },

  /**
   * Public web request — always same shape (anti-enumeration).
   */
  async requestFromWeb(body: {
    email: string;
    role_hint?: 'passenger' | 'driver' | 'both';
    full_name?: string;
  }) {
    const email = normalizeEmail(body.email ?? '');
    const generic = { ok: true as const, message: WEB_GENERIC_MESSAGE };

    if (!email || !EMAIL_RE.test(email)) {
      // Still generic — don't teach valid email formats beyond validation 400 for empty junk
      if (!email) return generic;
      return generic;
    }

    const emailHash = hashEmail(email);
    try {
      await assertWebEmailRateLimit(emailHash);
    } catch (err) {
      if (err instanceof TooManyRequestsError) throw err;
    }

    let authUser: AuthAdminUser | null = null;
    try {
      authUser = await fetchAuthUserFullByEmail(email);
    } catch (err) {
      logger.warn('[account-deletion] web auth lookup failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const dbUser = await resolveDbUser({
      authUserId: authUser?.id ?? null,
      email,
    });

    if (!authUser && !dbUser) {
      return generic;
    }

    if (dbUser && isStaffRole(dbUser.role)) {
      // Do not email staff; same generic response
      return generic;
    }

    const token = generateVerifyToken();
    const tokenHash = hashToken(token);
    const now = new Date();
    const expires = new Date(now.getTime() + tokenTtlMinutes() * 60_000);

    await db.insert(accountDeletionRequests).values({
      user_id: dbUser?.id ?? authUser?.id ?? null,
      auth_user_id: authUser?.id ?? null,
      email_normalized: email,
      email_hash: emailHash,
      requested_role_hint: body.role_hint ?? null,
      source: 'web',
      status: 'pending_verification',
      verify_token_hash: tokenHash,
      verify_expires_at: expires,
      retention_details: {
        source: 'web',
        full_name_hint: body.full_name ? 'provided' : null,
      },
    });

    try {
      await sendVerifyEmail(email, token);
    } catch (err) {
      logger.warn('[account-deletion] verify email failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return generic;
  },

  async verifyWebToken(body: { token: string }) {
    const token = (body.token ?? '').trim();
    if (!token || token.length < 16) {
      throw new BadRequestError('Token inválido');
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    // Find candidate pending rows (recent) and compare hash in constant-ish way
    const candidates = await db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.status, 'pending_verification'),
          eq(accountDeletionRequests.source, 'web'),
        ),
      )
      .orderBy(desc(accountDeletionRequests.created_at))
      .limit(50);

    const match = candidates.find((c) => {
      if (!c.verify_token_hash) return false;
      try {
        const a = Buffer.from(c.verify_token_hash, 'utf8');
        const b = Buffer.from(tokenHash, 'utf8');
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });

    if (!match) {
      throw new BadRequestError('El enlace no es válido o ya fue usado');
    }

    if (!canAcceptVerify(match.status)) {
      throw new ConflictError('Esta solicitud ya fue procesada');
    }

    if (match.verify_expires_at && match.verify_expires_at.getTime() < now.getTime()) {
      await db
        .update(accountDeletionRequests)
        .set({ status: 'failed', error_details: 'token_expired', updated_at: now })
        .where(eq(accountDeletionRequests.id, match.id));
      throw new BadRequestError('El enlace expiró. Pedí uno nuevo.');
    }

    // Resolve ids again at verify time
    const authUser = await fetchAuthUserFullByEmail(match.email_normalized);
    const dbUser = await resolveDbUser({
      authUserId: authUser?.id ?? match.auth_user_id,
      email: match.email_normalized,
    });

    if (dbUser && isStaffRole(dbUser.role)) {
      await db
        .update(accountDeletionRequests)
        .set({
          status: 'rejected',
          error_details: 'staff_role',
          verify_token_hash: null,
          updated_at: now,
        })
        .where(eq(accountDeletionRequests.id, match.id));
      throw new ForbiddenError('No se puede eliminar esta cuenta por este flujo');
    }

    if (!dbUser && !authUser) {
      await db
        .update(accountDeletionRequests)
        .set({
          status: 'failed',
          error_details: 'user_gone',
          verify_token_hash: null,
          updated_at: now,
        })
        .where(eq(accountDeletionRequests.id, match.id));
      throw new BadRequestError('No encontramos la cuenta asociada');
    }

    const userId = dbUser?.id ?? authUser!.id;
    const authUserId = authUser?.id ?? match.auth_user_id ?? userId;

    const active = await findActiveTripsForUser(userId);
    if (active.length > 0) {
      // Keep token so they can retry after the trip ends.
      throw new AppError(
        'Hay un viaje en curso. Terminá o cancelá el viaje e intentá de nuevo.',
        409,
        'ACTIVE_TRIP',
      );
    }

    await db
      .update(accountDeletionRequests)
      .set({
        status: 'requested',
        user_id: userId,
        auth_user_id: authUserId,
        verified_at: now,
        requested_at: now,
        verify_token_hash: null,
        verify_expires_at: null,
        updated_at: now,
      })
      .where(eq(accountDeletionRequests.id, match.id));

    scheduleProcess(match.id);

    return {
      ok: true,
      request_id: match.id,
      status: 'requested',
      message: 'Identidad verificada. Estamos eliminando tu cuenta.',
    };
  },

  async processInternal(requestId: string) {
    return processAccountDeletion(requestId);
  },
};
