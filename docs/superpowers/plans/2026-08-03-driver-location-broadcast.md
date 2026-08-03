# Driver Location Broadcast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broadcast driver location to passenger via Supabase Realtime when the driver has an active trip (states: accepted, en_route, waiting, in_trip).

**Architecture:** After persisting driver location via WebSocket, check if the driver has an active trip. If so, HTTP POST to Supabase Realtime REST API on topic `trip:{tripId}` with event `driver:location`. Throttling: max 500ms interval, min 5m displacement.

**Tech Stack:** Bun, Elysia, Drizzle ORM, Supabase Realtime REST API

## Global Constraints

- Use existing `haversineDistance` from `shared/lib/geo.ts` (no reimplementation)
- Use existing HTTP POST broadcast pattern from `trips/service.ts` (no `@supabase/supabase-js` channel API)
- No new npm packages
- No new DB migrations
- No new env vars
- Follow existing test patterns from `location/location.test.ts`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/shared/lib/broadcast.ts` | Create | `broadcastTripLocation(tripId, payload)` — HTTP POST to Supabase Realtime, throttling |
| `src/shared/lib/trip-utils.ts` | Create | `getDriverActiveTrip(driverId)`, `invalidateTripCache(driverId)` — Drizzle query + cache |
| `src/features/location/routes.ts` | Modify | Hook `broadcastTripLocation` after `upsertLocation`; invalidate cache on WS close |
| `src/features/location/location.test.ts` | Modify | Add tests for broadcast behavior and trip-utils |

---

### Task 1: Create `src/shared/lib/trip-utils.ts`

**Files:**
- Create: `apps/backend/src/shared/lib/trip-utils.ts`

**Interfaces:**
- Produces: `getDriverActiveTrip(driverId: string): Promise<{id: string} | null>`, `invalidateTripCache(driverId: string): void`

- [ ] **Step 1: Write the file**

```typescript
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { trips } from '../db/schema';

const ACTIVE_TRIP_STATUSES = ['accepted', 'en_route', 'waiting', 'in_trip'] as const;

interface CacheEntry {
  tripId: string | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;
const NEGATIVE_CACHE_TTL_MS = 2000;

export async function getDriverActiveTrip(driverId: string): Promise<{ id: string } | null> {
  const cached = cache.get(driverId);
  if (cached && cached.expires > Date.now()) {
    return cached.tripId ? { id: cached.tripId } : null;
  }

  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.driver_id, driverId),
        inArray(trips.status, ACTIVE_TRIP_STATUSES),
      ),
    )
    .limit(1);

  const ttl = trip ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  cache.set(driverId, {
    tripId: trip?.id ?? null,
    expires: Date.now() + ttl,
  });

  return trip ?? null;
}

export function invalidateTripCache(driverId: string): void {
  cache.delete(driverId);
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `bun --filter @lifty/backend typecheck`
Expected: No errors related to trip-utils.ts

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/shared/lib/trip-utils.ts
git commit -m "feat: add trip-utils with active trip detection and cache"
```

---

### Task 2: Create `src/shared/lib/broadcast.ts`

**Files:**
- Create: `apps/backend/src/shared/lib/broadcast.ts`

**Interfaces:**
- Consumes: `haversineDistance` from `shared/lib/geo.ts`
- Produces: `broadcastTripLocation(tripId: string, payload: {lat: number, lng: number, heading?: number, driver_id: string}): void`

- [ ] **Step 1: Write the file**

```typescript
import { logger } from './logger';
import { haversineDistance } from './geo';

interface LocationPayload {
  lat: number;
  lng: number;
  heading?: number;
  driver_id: string;
}

interface LastBroadcast {
  timestamp: number;
  lat: number;
  lng: number;
}

const lastBroadcastMap = new Map<string, LastBroadcast>();
const MIN_INTERVAL_MS = 500;
const MIN_DISTANCE_M = 5;

function shouldBroadcast(tripId: string, lat: number, lng: number): boolean {
  const last = lastBroadcastMap.get(tripId);
  if (!last) return true;

  const timeSinceLast = Date.now() - last.timestamp;
  if (timeSinceLast < MIN_INTERVAL_MS) return false;

  const distanceKm = haversineDistance(last.lat, last.lng, lat, lng);
  if (distanceKm * 1000 < MIN_DISTANCE_M) return false;

  return true;
}

export function broadcastTripLocation(
  tripId: string,
  payload: LocationPayload,
): void {
  if (!shouldBroadcast(tripId, payload.lat, payload.lng)) return;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return;
  }

  const topic = `trip:${tripId}`;

  lastBroadcastMap.set(tripId, {
    timestamp: Date.now(),
    lat: payload.lat,
    lng: payload.lng,
  });

  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event: 'driver:location',
          payload: {
            ...payload,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    }),
  })
    .then((res) => logger.info('[BROADCAST] Response:', res.status))
    .catch((err) => logger.error('[BROADCAST] Error:', (err as Error).message));
}

export function clearBroadcastThrottle(tripId: string): void {
  lastBroadcastMap.delete(tripId);
}
```

- [ ] **Step 2: Export `haversineDistance` from `geo.ts`**

The function is currently private. Edit `apps/backend/src/shared/lib/geo.ts`:

Find line 78:
```typescript
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
```

Replace with:
```typescript
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
```

- [ ] **Step 3: Verify compilation**

Run: `bun --filter @lifty/backend typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/lib/broadcast.ts apps/backend/src/shared/lib/geo.ts
git commit -m "feat: add broadcastTripLocation with throttling for driver location realtime"
```

---

### Task 3: Modify `src/features/location/routes.ts` to hook broadcast

**Files:**
- Modify: `apps/backend/src/features/location/routes.ts`

**Interfaces:**
- Consumes: `broadcastTripLocation` from `shared/lib/broadcast.ts`, `getDriverActiveTrip` + `invalidateTripCache` from `shared/lib/trip-utils.ts`

- [ ] **Step 1: Add imports (after line 9)**

```typescript
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { safeCall } from '../../shared/lib/route-utils';
import { getSupabaseClient } from '../../shared/lib/supabase';
import { authGuard } from '../../shared/middleware/require-auth';
import { locationUpdateBody } from './schema';
import { getDriverIdByUserId, markDriverOffline, upsertLocation } from './service';
import { broadcastTripLocation } from '../../shared/lib/broadcast';
import { getDriverActiveTrip, invalidateTripCache } from '../../shared/lib/trip-utils';
```

- [ ] **Step 2: Add broadcast call after `upsertLocation` in `message` handler (after line 87)**

Replace:
```typescript
    await upsertLocation(driverId, data.lat, data.lng, data.heading);
```

With:
```typescript
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
```

- [ ] **Step 3: Add cache invalidation in `close` handler (after line 92)**

Replace:
```typescript
  async close(ws) {
    const driverId = (ws.data as any).driverId as string | undefined;
    if (driverId) {
      await markDriverOffline(driverId);
    }
  },
```

With:
```typescript
  async close(ws) {
    const driverId = (ws.data as any).driverId as string | undefined;
    if (driverId) {
      invalidateTripCache(driverId);
      await markDriverOffline(driverId);
    }
  },
```

- [ ] **Step 4: Verify compilation**

Run: `bun --filter @lifty/backend typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/location/routes.ts
git commit -m "feat: broadcast driver location to trip channel on WS update"
```

---

### Task 4: Add tests

**Files:**
- Modify: `apps/backend/src/features/location/location.test.ts`

- [ ] **Step 1: Add test imports (after existing imports around line 118)**

After `import { findNearbyOnlineDrivers } from './service';` append:
```typescript
import { getDriverActiveTrip, invalidateTripCache } from '../../shared/lib/trip-utils';
import { trips } from '../../shared/db/schema';
```

- [ ] **Step 2: Add `describe('getDriverActiveTrip')` block before `beforeAll`**

Insert after line 119 and before `beforeAll` (line 120):

```typescript
describe('getDriverActiveTrip', () => {
  test('returns null when driver has no trips', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619999999', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).toBeNull();
  });

  test('returns trip when driver has active trip', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492618888888', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driver.id,
        status: 'accepted',
        origin_lat: -32.89,
        origin_lng: -68.84,
        dest_lat: -32.90,
        dest_lng: -68.85,
      })
      .returning({ id: trips.id });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(trip.id);
  });

  test('returns null for terminal trip statuses', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492617777777', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    await db.insert(trips).values({
      driver_id: driver.id,
      status: 'completed',
      origin_lat: -32.89,
      origin_lng: -68.84,
      dest_lat: -32.90,
      dest_lng: -68.85,
    });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).toBeNull();
  });

  test('caches result and invalidates on request', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492616666666', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driver.id,
        status: 'accepted',
        origin_lat: -32.89,
        origin_lng: -68.84,
        dest_lat: -32.90,
        dest_lng: -68.85,
      })
      .returning({ id: trips.id });

    invalidateTripCache(driver.id);
    const result1 = await getDriverActiveTrip(driver.id);
    expect(result1!.id).toBe(trip.id);

    const result2 = await getDriverActiveTrip(driver.id);
    expect(result2!.id).toBe(trip.id);

    invalidateTripCache(driver.id);

    await db.update(trips).set({ status: 'completed' }).where(eq(trips.id, trip.id));

    const result3 = await getDriverActiveTrip(driver.id);
    expect(result3).toBeNull();
  });
});
```

- [ ] **Step 3: Add `describe('Broadcast on location update')` before the final `});` of the file**

Insert before line 427 (final `});`):

```typescript
describe('Broadcast on location update', () => {
  test('WS broadcast is called when driver has active trip', async () => {
    const phone = '+5492615555555';
    const { token, driverId } = await registerAndCreateDriver(phone, 'testPass123');
    const db = getDb();

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'accepted',
      origin_lat: -32.89,
      origin_lng: -68.84,
      dest_lat: -32.90,
      dest_lng: -68.85,
    });

    invalidateTripCache(driverId);

    const fetchCalls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: any) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as any;

    try {
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 500));

      const broadcastCall = fetchCalls.find(
        (c) => c.url.includes('/realtime/v1/api/broadcast'),
      );
      expect(broadcastCall).toBeDefined();
      const msg = broadcastCall.body.messages[0];
      expect(msg.topic).toMatch(/^trip:/);
      expect(msg.event).toBe('driver:location');
      expect(msg.payload.lat).toBe(-32.89);
      expect(msg.payload.lng).toBe(-68.84);
      expect(msg.payload.heading).toBe(180);
      expect(msg.payload.driver_id).toBe(driverId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, { timeout: 15000 });

  test('WS does not broadcast when driver has no active trip', async () => {
    const phone = '+5492614444444';
    const { token, driverId } = await registerAndCreateDriver(phone, 'testPass123');

    invalidateTripCache(driverId);

    const fetchCalls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: any) => {
      fetchCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as any;

    try {
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 500));

      const broadcastCalls = fetchCalls.filter(
        (c) => c.url?.includes('/realtime/v1/api/broadcast'),
      );
      expect(broadcastCalls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, { timeout: 15000 });
});
```

- [ ] **Step 4: Run tests**

Run: `bun --filter @lifty/backend test`
Expected: All tests pass, new tests included

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/location/location.test.ts
git commit -m "test: add broadcast and trip-utils tests for driver location"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full test suite**

```bash
bun --filter @lifty/backend test
```
Expected: All 200+ tests pass, no regressions.

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @lifty/backend typecheck
```
Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
bun run lint
```
Expected: No errors in changed files.
