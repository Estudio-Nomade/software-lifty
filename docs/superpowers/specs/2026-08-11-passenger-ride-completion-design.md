# Passenger Ride Completion — Design Spec

**Date:** 2026-08-11
**Scope:** `apps/backend/src/features/passenger-trips/` + `apps/backend/src/features/trips/service.ts`

## Story 1.1: Driver location in /active

Add `LEFT JOIN driver_locations` to `getActiveTrip` and `getTripById` in `passenger-trips/service.ts`.

Fields added:
- `driver_lat` → `driverLocations.lat`
- `driver_lng` → `driverLocations.lng`

Null when no driver assigned or no location data.

## Story 1.2: Realtime status broadcast

New function in `passenger-trips/service.ts`:
```ts
export function broadcastToPassenger(passengerId: string, trip: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing config for passenger broadcast');
    return;
  }
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      messages: [{ topic: `passenger:${passengerId}`, event: 'trip:status', payload: trip }]
    }),
  }).catch((err) => logger.error('[BROADCAST] Passenger broadcast error:', (err as Error).message));
}
```

Hook calls into `features/trips/service.ts` after each status transition where `trip.passenger_id` exists:
- `claimTrip` → after setting status 'accepted'
- `enRouteTrip` → after transitionTrip returns
- `arrivedTrip` → after transitionTrip returns  
- `startTrip` → after transitionTrip returns
- `completeTrip` → after transitionTrip returns

Import: `import { broadcastToPassenger } from '../passenger-trips/service';`

## Story 1.3: Trip history

Add to `passenger-trips/service.ts`:
```ts
async getTripHistory(user: AuthUser, page: number, limit: number) {
  const offset = (page - 1) * limit;
  return db
    .select({
      ...getTableColumns(trips),
      driver_name: users.full_name,
      driver_avatar_url: users.avatar_url,
      driver_rating: sql`(SELECT ROUND(AVG(r.score)::numeric, 1)::float FROM ${ratings} r WHERE r.ratee_id = ${users.id})`,
      vehicle_brand: vehicles.brand,
      vehicle_model: vehicles.model,
      vehicle_color: vehicles.color,
      vehicle_plate: vehicles.plate,
      driver_lat: driverLocations.lat,
      driver_lng: driverLocations.lng,
    })
    .from(trips)
    .leftJoin(drivers, eq(trips.driver_id, drivers.id))
    .leftJoin(users, eq(drivers.user_id, users.id))
    .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
    .leftJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
    .where(eq(trips.passenger_id, user.id))
    .orderBy(desc(trips.created_at))
    .limit(limit)
    .offset(offset);
},
```

Route: `GET /passenger/trips/history` with query params `?page=1&limit=20`.

## Files changed

| File | Change |
|------|--------|
| `passenger-trips/service.ts` | Add joins for location (1.1), add broadcastToPassenger (1.2), add getTripHistory (1.3) |
| `passenger-trips/routes.ts` | Add GET /history route (1.3) |
| `trips/service.ts` | Import + call broadcastToPassenger in 5 status methods (1.2) |

## Testing

- Story 1.1: Extend existing active trip test to assert driver_lat/driver_lng
- Story 1.2: Verify broadcastToPassenger is exported and accepts passengerId + trip  
- Story 1.3: Test history pagination, empty history, cross-user isolation
