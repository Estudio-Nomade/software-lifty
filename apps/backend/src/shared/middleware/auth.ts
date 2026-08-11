import type { User } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../db/client';
import { drivers, passengerProfiles, users } from '../db/schema';
import { logger } from '../lib/logger';
import { getSupabaseClient } from '../lib/supabase';

export async function deriveRole(userId: string): Promise<string | null> {
  const [driver] = await db
    .select({ id: drivers.user_id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);

  let passengerProfileExists = false;
  try {
    const [passenger] = await db
      .select({ id: passengerProfiles.user_id })
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, userId))
      .limit(1);
    passengerProfileExists = !!passenger;
  } catch {
    passengerProfileExists = false;
  }

  if (driver && passengerProfileExists) return 'both';
  if (driver) return 'driver';
  if (passengerProfileExists) return 'passenger';

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.role ?? null;
}

export interface AuthUser {
  id: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

export type AuthStatus = 'no_token' | 'token_expired' | 'token_invalid' | 'authenticated';

type ResolveUser = (token: string) => Promise<AuthUser | null>;

function extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return payload.sub ?? null;
    }
    return token;
  } catch {
    return token;
  }
}

async function getTestUserFromToken(token: string): Promise<AuthUser | null> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  const role = await deriveRole(row.id);

  return { id: row.id, role, email: row.email, phone: row.phone };
}

function realGetUser(token: string): Promise<AuthUser | null> {
  const isDevOrTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (isDevOrTest) {
      return getTestUserFromToken(token);
    }
    logger.warn('[AUTH] Supabase client not configured, rejecting all requests');
    return Promise.resolve(null);
  }
  return supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data.user) {
      if (isDevOrTest) return getTestUserFromToken(token);
      return null;
    }
    return findOrCreateUser(data.user);
  });
}

async function findOrCreateUser(supabaseUser: User): Promise<AuthUser | null> {
  const [existing] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, supabaseUser.id))
    .limit(1);

  if (existing) {
    const role = await deriveRole(existing.id);
    return {
      id: existing.id,
      role,
      email: existing.email,
      phone: existing.phone,
    };
  }

  const [created] = await db
    .insert(users)
    .values({
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
      phone: (supabaseUser as { phone?: string }).phone ?? null,
      role: 'driver',
    })
    .returning({
      id: users.id,
      email: users.email,
      phone: users.phone,
      role: users.role,
    });

  if (!created) return null;

  return {
    id: created.id,
    role: created.role,
    email: created.email,
    phone: created.phone,
  };
}

export function createAuthPlugin(resolveUser?: ResolveUser) {
  const getUser = resolveUser ?? realGetUser;

  return new Elysia({ name: 'auth' }).derive(
    { as: 'scoped' },
    async ({ request }): Promise<{ user: AuthUser | null; authStatus: AuthStatus }> => {
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return { user: null, authStatus: 'no_token' };
      }

      try {
        const user = await getUser(authHeader.slice(7));
        if (!user) {
          return { user: null, authStatus: 'token_invalid' };
        }
        return { user, authStatus: 'authenticated' };
      } catch (err) {
        const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
        logger.warn('[AUTH] getUser failed', {
          error: (err as Error).message,
          cause: cause instanceof Error ? cause.message : cause,
          stack: (err as Error).stack,
        });
        return { user: null, authStatus: 'token_invalid' };
      }
    },
  );
}

export const authPlugin = createAuthPlugin();
