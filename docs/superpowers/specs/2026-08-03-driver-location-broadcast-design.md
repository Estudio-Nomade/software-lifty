# Driver Location Broadcast — Design Spec

**Date:** 2026-08-03  
**Status:** Approved  
**Scope:** Backend only (broadcast); mobile subscription is separate  

## Problem

El pasajero ve la ruta dibujada en el mapa pero no ve el ícono del auto del conductor moviéndose en tiempo real durante las fases `accepted` → `en_route` → `waiting` → `in_trip`.

Actualmente el WebSocket `/ws/location` solo persiste la ubicación del conductor en `driver_locations`. No la retransmite al pasajero.

## Solution

Al recibir una actualización de ubicación del conductor (vía WS), si el conductor tiene un viaje activo, hacer broadcast al pasajero vía Supabase Realtime.

### Arquitectura

```
Driver mobile ──WS──► /ws/location ──► upsertLocation(DB)
                                           │
                                           ▼
                              getDriverActiveTrip(driverId)
                                           │
                                    [viaje activo?]
                                           │ sí
                                           ▼
                              broadcastTripLocation(tripId, {lat, lng, heading})
                                           │
                                           ▼
                              POST /realtime/v1/api/broadcast
                              topic: trip:{tripId}
                              event: driver:location
                                           │
                                           ▼
                              Passenger mobile ── supabase.channel('trip:{tripId}')
```

### Files

| File | Action | Purpose |
|---|---|---|
| `src/shared/lib/broadcast.ts` | New | Reusable `broadcastTripLocation(tripId, payload)` using HTTP POST to Supabase Realtime REST API. Throttling: 500ms min interval + 5m min displacement (Haversine from `geo.ts`). |
| `src/shared/lib/trip-utils.ts` | New | `getDriverActiveTrip(driverId)` — Drizzle query filtering `status IN ('accepted','en_route','waiting','in_trip')`. In-memory Map cache with 5s TTL. `invalidateTripCache(driverId)`. |
| `src/features/location/routes.ts` | Modify | After `upsertLocation` in `message` handler, call `getDriverActiveTrip` + `broadcastTripLocation`. In `close` handler, call `invalidateTripCache`. |

### Broadcast payload

```json
{
  "lat": -31.9,
  "lng": -65.2,
  "heading": 180,
  "driver_id": "uuid",
  "timestamp": "2026-08-03T..."
}
```

### Active trip states (where broadcast happens)

| Status | Broadcast? |
|---|---|
| `request_received` | No |
| `accepted` | Yes |
| `en_route` | Yes |
| `waiting` | Yes |
| `in_trip` | Yes |
| `completed`, `cancelled`, `rejected`, `rated` | No |

### Throttling

- Minimum 500ms between broadcasts per trip
- Minimum 5m displacement (Haversine) to send a new broadcast
- Prevents flooding the channel when driver is stationary

### Cache

- Active trip status cached per `driverId` in a `Map<string, {tripId: string, expires: number}>`
- TTL: 5 seconds
- Invalidated on: WS close, or when trip reaches terminal state (future hook)
- Cache miss → single Drizzle query

### Dependencies

- Existing `haversineDistance` from `shared/lib/geo.ts`
- Existing broadcast HTTP POST pattern from `trips/service.ts`
- No new npm packages
- No new DB migrations
- No new env vars (uses existing `SUPABASE_URL` + `SUPABASE_SECRET_KEY`)

### Mobile integration (out of scope, noted for context)

The mobile app already defines `subscribeToTripChannel` in `src/lib/realtime.ts`. It needs a new callback `onDriverLocation` listening for event `driver:location` on the `trip:{tripId}` channel. This will update the driver marker position on the map.

## Edge Cases

1. **Driver closes WS mid-trip**: `close` handler invalidates cache. Broadcast stops naturally.
2. **Multiple location updates per second**: Throttling limits to 2 broadcasts/sec max.
3. **Trip status changes while broadcasting**: Next cache miss will re-query and stop broadcasting if trip is no longer active.
4. **Supabase broadcast fails**: Logged and silently ignored. No retry (real-time data is ephemeral).
5. **No active trip**: `getDriverActiveTrip` returns null → no broadcast → no DB query wasted (cached negative result for 2s).
