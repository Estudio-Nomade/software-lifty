import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { broadcastTripLocation } from '../../shared/lib/broadcast';
import { safeCall } from '../../shared/lib/route-utils';
import { getSupabaseClient } from '../../shared/lib/supabase';
import { getDriverActiveTrip, invalidateTripCache } from '../../shared/lib/trip-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { locationUpdateBody } from './schema';
import { getDriverIdByUserId, markDriverOffline, upsertLocation } from './service';

async function resolveUserIdFromToken(token: string): Promise<string | null> {
  if (process.env.NODE_ENV === 'test') {
    try {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, token))
        .limit(1);
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  }

  return null;
}

export const locationWsPlugin = new Elysia().ws('/ws/location', {
  async open(ws) {
    let resolveReady: (driverId: string | null) => void;
    (ws.data as any).ready = new Promise<string | null>((resolve) => {
      resolveReady = resolve;
    });

    const token = ws.data.query?.token;
    if (!token) {
      ws.close(4001, 'Unauthorized');
      resolveReady!(null);
      return;
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      ws.close(4001, 'Unauthorized');
      resolveReady!(null);
      return;
    }

    (ws.data as any).userId = userId;

    const driverId = await getDriverIdByUserId(userId).catch(() => null);
    if (!driverId) {
      ws.close(4001, 'No driver profile');
      resolveReady!(null);
      return;
    }

    (ws.data as any).driverId = driverId;
    resolveReady!(driverId);
  },
  async message(ws, message: any) {
    let data = message;
    if (typeof message === 'string') {
      try {
        data = JSON.parse(message);
      } catch {
        return;
      }
    }

    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;

    let driverId = (ws.data as any).driverId as string | undefined;
    if (!driverId) {
      const ready = (ws.data as any).ready as Promise<string | null> | undefined;
      driverId = (ready ? await ready : null) ?? undefined;
      if (!driverId) return;
    }

    await upsertLocation(driverId, data.lat, data.lng, data.heading);

    const activeTrip = await getDriverActiveTrip(driverId);
    if (activeTrip) {
      broadcastTripLocation(activeTrip.id, {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        driver_id: driverId,
      });
    }
  },
  async close(ws) {
    const driverId = (ws.data as any).driverId as string | undefined;
    if (driverId) {
      invalidateTripCache(driverId);
      await markDriverOffline(driverId);
    }
  },
});

export const locationHttpPlugin = new Elysia({ prefix: '/location' }).use(authGuard).post(
  '/update',
  ({ user, body, set }) => {
    return safeCall(async () => {
      const driverId = await getDriverIdByUserId(user.id);
      await upsertLocation(driverId, body.lat, body.lng, body.heading);
      return { message: 'Location updated' };
    }, set);
  },
  { body: locationUpdateBody, requireAuth: true },
);
