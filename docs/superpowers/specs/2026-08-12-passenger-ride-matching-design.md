# Passenger Ride Request → Driver Matching

**Date**: 2026-08-12
**Status**: Approved by user
**Scope**: `apps/backend/src/shared/lib/geo.ts`, `apps/mobile-passengers/src/{api,hooks,lib,screens,store,components}`

## Goal

Wire the passenger "SOLICITAR" action end-to-end: request a ride with real coordinates, show a "Conectando con el conductor" screen that waits (via Supabase Realtime) for a nearby driver to claim the trip, then land on the trip-in-progress screen with the real driver data.

## Background

Today `VehicleSelectScreen`'s "SOLICITAR" button navigates straight to a hardcoded `TripInProgressScreen` (placeholder map, mock "Juan Pérez"). The backend already implements nearest-driver matching, but the passenger app never calls `POST /passenger/trips/request`, has no realtime subscription, and has no "searching" screen. The autocomplete only returns address text (no coordinates), which `requestTrip` requires.

## Driver backend flow (verified)

1. `passengerTripService.requestTrip` inserts the trip with `status: 'pending'`, `driver_id: null` (`passenger-trips/service.ts:85-107`), then `matchAndBroadcast` runs async.
2. `matchAndBroadcast` → `findNearbyDrivers` (online drivers within 5km of origin, sorted by distance) → for each: `broadcastTripRequest` emits `trip:request` on `driver:<driverId>` + push (`matching.service.ts:52-87`).
3. Driver accepts by **claiming**: `POST /trips/:id/claim` → `claimTrip` requires `driver_id === null` and status `pending`/`offered`, then sets `driver_id`, `status: 'accepted'`, generates `verification_code` (`trips/service.ts:716-772`).
4. `claimTrip` calls `broadcastToPassenger(trip.passenger_id, updated)` → emits `trip:status` on `passenger:<passengerId>` with the full trip row (now with `driver_id`) (`trips/service.ts:767-769`).

The realtime `trip:status` payload is the raw `trips` row — it does **not** include the joined driver name/vehicle. Those come from `GET /passenger/trips/:id` (which LEFT JOINs `users`, `vehicles`, `driverLocations`, `ratings`).

## Data model changes

### Backend

`PlaceResult` (`shared/lib/geo.ts`) gains `lat: number` and `lng: number`. `autocomplete` maps Photon's `geometry.coordinates: [lng, lat]` into them (Photon already returns them — no new external call).

### Frontend

- `PlaceSuggestion` (`api/types.ts`) gains `lat` and `lng`.
- `requestRide` (`api/passenger.ts`) body is rewritten to match `requestTripBody`:
  `{ origin_lat, origin_lng, dest_lat, dest_lng, origin_address?, dest_address?, vehicle_type: 'auto'|'moto', distance_km, duration_minutes }` (drop the current `pickup_*`/`destination_*`/`payment_method` shape).
- `Trip` (`api/types.ts`) fields corrected to the backend columns: `id, passenger_id, driver_id?, status, origin_lat, origin_lng, dest_lat, dest_lng, origin_address, dest_address, distance_km, duration_minutes, total_fare, vehicle_type, verification_code, driver_name?, driver_avatar_url?, driver_rating?, vehicle_brand?, vehicle_model?, vehicle_color?, vehicle_plate?, created_at, updated_at`.

## Frontend flow

### 1. Coordinates
- `HomeScreen.handleSelectSuggestion` stores the destination's `lat`/`lng` alongside the description. Pickup coordinates = `locationStore.current` (GPS). Both are passed to `VehicleSelect` via route params (`pickup`, `destination`, `pickupLat`, `pickupLng`, `destLat`, `destLng`).

### 2. Request on SOLICITAR
- `VehicleSelectScreen` "SOLICITAR" handler:
  1. `GET /maps/directions?origin_lat&origin_lng&dest_lat&dest_lng` → `distance_km`, `duration_minutes`.
  2. `requestRide(...)` → returns the created trip (`status: 'pending'`, `id`).
  3. Navigate to `ConnectingDriver` with `{ tripId }`.

### 3. ConnectingDriver screen (new)
- Route `app/connecting-driver.tsx`, screen `ConnectingDriverScreen`; add `ConnectingDriver: '/connecting-driver'` to `useAppNavigation`.
- Shows a spinner + "Conectando con el conductor...".
- Subscribes to `passenger:<userId>` realtime channel (new `src/lib/realtime.ts` `subscribeToPassengerChannel`).
- On `trip:status` where the trip has `driver_id`: fetch full details via `getRideDetails(tripId)` (or `getActiveRide`), store into `rideStore`, navigate to `TripInProgress`.
- 30s timeout → "No hay conductores disponibles cerca" + button that cancels the trip (`cancelRide`) and returns to Home.
- Cancel button during search → `cancelRide(tripId)` + back to Home.
- On unmount, unsubscribe the realtime channel.

### 4. TripInProgress (real data)
- Reads `activeTrip` from `rideStore`; on mount, if missing, fetches `getActiveRide()`.
- Renders the real driver (name, rating, vehicle brand/model/plate) + `PassengerMap` centered on the driver's location. No live tracking in this iteration.

### 5. Realtime lib (new)
- `src/lib/realtime.ts` mirrors the driver's `apps/mobile/src/lib/realtime.ts`: `subscribeToPassengerChannel(passengerId, onTripStatus)` using `supabase.channel('passenger:<id>')` and `channel.on('broadcast', { event: 'trip:status' }, ...)`; returns an unsubscribe function.

## Error handling

- `requestRide` failure → Alert + stay on `VehicleSelect`.
- No driver (30s timeout) → "No hay conductores disponibles cerca" + cancel/back.
- Realtime subscription failure → fall back to the 30s timeout (no silent hang).
- Trip cancelled/expired while searching → treat like no driver (show message).

## Testing

- Backend: `autocomplete` returns `lat`/`lng` (assert against mock/test path).
- Frontend: `requestRide` sends the corrected body; `ConnectingDriver` unit (timeout → message, realtime event → navigates, cancel → `cancelRide`); `rideStore` set/reset.

## Non-goals (future)

- Live driver tracking (moving marker, ETA, `en_route`/`waiting`/`started`/`completed` transitions).
- Real fare shown in `VehicleSelect` (prices stay mock; the backend computes the real fare on request).
- Manual "Desde" address (pickup is GPS).
- Driver "reject/expire" handling in the passenger app (only success + timeout this iteration).
