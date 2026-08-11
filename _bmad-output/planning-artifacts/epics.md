---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - _bmad-output/planning-artifacts/passenger-app/prd.md
  - _bmad-output/planning-artifacts/passenger-app/architecture-spine.md
---

# software-lifty (Passenger Backend) - Epic Breakdown

## Overview

This document provides the epic and story breakdown for the Lifty passenger backend, decomposing requirements from the PRD and Architecture into implementable backend stories. Focus: backend endpoints, services, and infrastructure — not frontend screens.

## Requirements Inventory

### Functional Requirements

Only backend-relevant FRs that are NOT yet implemented are listed:

FR7: Fare estimate endpoint — `POST /maps/fare-estimate` — ✅ EXISTS
FR9: Trip request endpoint — `POST /passenger/trips/request` — ✅ IMPLEMENTED
FR10: Driver search / active trip polling — `GET /passenger/trips/active` with driver location — ⚠️ PARTIAL (driver location missing)
FR12: Verification code generation — ✅ EXISTS in claimTrip/acceptTrip
FR13: Real-time tracking — broadcast driver status changes to passenger — ❌ MISSING
FR14: Trip cancellation — `POST /passenger/trips/:id/cancel` — ✅ IMPLEMENTED
FR15: SOS — `POST /sos` — ✅ EXISTS
FR17: Rating — `POST /ratings/trips/:trip_id` — ✅ EXISTS
FR18: Payment initiation — `POST /passenger/trips/:id/pay` (MercadoPago checkout) — ❌ MISSING
FR19: Trip history — `GET /passenger/trips/history` — ❌ MISSING
FR20: Trip detail — `GET /passenger/trips/:id` — ✅ IMPLEMENTED
FR21: Profile — `GET /passenger/profile` — ✅ IMPLEMENTED

### NonFunctional Requirements

NFR1: Real-time tracking — broadcast driver status to passenger topic on each state change
NFR2: Payment reliability — MP webhook idempotency, retry on failure
NFR3: History pagination — cursor/offset-based, max 50 per page

### Additional Requirements

From Architecture AD-8 (API client owns HTTP):
- All passenger endpoints use the same error shape (`safeCall` convention)
- All endpoints behind `authGuard` with role check
- Rate limits on state-changing endpoints

From Architecture AD-3 (Supabase owns auth):
- Passenger identity from JWT `user.id`, mapped to `passenger_profiles` table
- Backend reads `user.role` for authorization (not a separate passenger token)

From existing codebase patterns:
- Use `broadcastTripRequest` (exported from trips/service.ts) for realtime
- Use `sendPushToUser` for push notifications
- Reuse `calculateFare`, `getCommissionRate`, `geocode` from shared libs

### UX Design Requirements

No UX design document exists. Backend decisions driven by PRD user journeys and Pencil design screens.

### FR Coverage Map

| FR | Epic | Story |
|----|------|-------|
| FR10 (driver location) | Epic 1 | Story 1.1 |
| FR13 (realtime tracking) | Epic 1 | Story 1.2 |
| FR19 (trip history) | Epic 1 | Story 1.3 |

## Epic List

### Epic 1: Passenger Ride Experience — Backend Completion

The passenger can see the driver's real-time location on the map, receive status updates without polling the server every few seconds, and browse their full trip history with route details, fares, and ratings.

**FRs covered:** FR10 (partial), FR13, FR19

**Stories:**
- Story 1.1: Driver location in active trip — join `driver_locations` into `GET /passenger/trips/active`
- Story 1.2: Realtime status push — broadcast to `passenger:<id>` topic on driver state transitions
- Story 1.3: Trip history — `GET /passenger/trips/history` with pagination

### Story 1.1: Driver Location in Active Trip Endpoint

As a passenger,
I want `GET /passenger/trips/active` to include the driver's current latitude and longitude,
So that the app can show the driver's position on the map without a separate API call.

**Acceptance Criteria:**

**Given** a trip with an assigned driver who has a registered location in `driver_locations`,
**When** I call `GET /passenger/trips/active`,
**Then** the response includes `driver_lat` and `driver_lng` fields with the driver's last known position.

**Given** a trip with an assigned driver but NO location in `driver_locations`,
**When** I call `GET /passenger/trips/active`,
**Then** `driver_lat` and `driver_lng` are `null` (no error).

**Given** a trip with NO assigned driver (pending search),
**When** I call `GET /passenger/trips/active`,
**Then** `driver_lat` and `driver_lng` are `null`.

**Implementation:** Add `LEFT JOIN driver_locations` to `getActiveTrip` query in `passenger-trips/service.ts`. Also add it to `getTripById`. Zero new endpoints.

### Story 1.2: Realtime Status Broadcast to Passenger

As a passenger with an active trip,
I want to receive real-time updates via Supabase Realtime when the driver changes status,
So that my app updates instantly without polling every 5 seconds.

**Acceptance Criteria:**

**Given** a trip with an assigned driver,
**When** the driver transitions status (accept → en-route → arrived → start → complete),
**Then** the backend broadcasts to topic `passenger:<passenger_id>` with the updated trip data and new status.

**Given** a trip with NO assigned driver (pending),
**When** no broadcast occurs,
**Then** no error is logged.

**Given** the broadcast infrastructure (Supabase Realtime) is unavailable,
**When** a status transition happens,
**Then** the backend logs a warning but does NOT fail the transition (fire-and-forget).

**Implementation:** Add a `broadcastToPassenger(passengerId, trip)` function in `passenger-trips/service.ts`. Add broadcast calls in `trips/service.ts` after each driver status-changing method (claimTrip, enRouteTrip, arrivedTrip, startTrip, completeTrip). Fire-and-forget via fetch to Supabase Realtime API — identical pattern to existing `broadcastTripRequest`.

### Story 1.3: Trip History Endpoint

As a passenger,
I want `GET /passenger/trips/history` to return my past trips with pagination,
So that I can browse completed and cancelled trips with route, fare, driver info, and rating.

**Acceptance Criteria:**

**Given** I am authenticated as a passenger with 25 past trips,
**When** I call `GET /passenger/trips/history?page=1&limit=10`,
**Then** I receive the first 10 trips ordered by most recent, with `total_fare`, `origin_address`, `dest_address`, `status`, `created_at`, driver name/rating, and vehicle info.

**Given** I call with no params,
**When** default page=1, limit=20 is applied,
**Then** I receive up to 20 trips.

**Given** I have zero trips,
**When** I call the endpoint,
**Then** I receive an empty array and status 200.

**Given** I am a driver calling this endpoint,
**When** the role check runs,
**Then** I receive 403 Forbidden.

**Given** a trip has no driver assigned (cancelled before match),
**When** I view history,
**Then** driver fields are `null` (LEFT JOIN, no error).

**Implementation:** Add `getTripHistory(user, page, limit)` to `passenger-trips/service.ts`. `GET /passenger/trips/history` route with `?page` and `?limit` query params. Mirror the existing `tripService.getTripHistory` pattern but filter by `passenger_id`. Return same joined shape as `/active`.
