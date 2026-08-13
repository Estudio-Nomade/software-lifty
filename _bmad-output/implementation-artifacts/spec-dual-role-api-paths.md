---
title: 'Dual-role passenger access + client API path alignment'
type: 'bugfix'
created: '2026-08-13'
status: 'done'
baseline_commit: '0c763cd'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/apps/backend/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dual-role users (`role: 'both'`) get 403 on passenger trip endpoints because `requirePassenger` only allows exact `'passenger'`. The passenger app also calls non-existent paths for fare estimate (`POST /passenger/rides/estimate`) and rating (`POST /passenger/trips/:id/rate`); backend has `POST /maps/fare-estimate` and only a **driver→passenger** rating at `POST /ratings/trips/:trip_id`.

**Approach:** Align passenger gate with `requireRole('passenger')` semantics (accept `passenger` and `both`). Point the mobile client at `/maps/fare-estimate`. Add a passenger→driver rate endpoint at the path the client already uses, reusing ratings table/status transitions without breaking the existing driver rate flow.

## Boundaries & Constraints

**Always:**
- Dual-role users can call passenger trip endpoints (request, active, get, cancel, rate).
- Driver-only rating at `POST /ratings/trips/:trip_id` keeps current behavior (driver rates passenger).
- Passenger rate: only the trip’s `passenger_id`, trip status `completed`, one rating per rater per trip; ratee is the driver’s `user_id`; update that driver’s `rating_avg`.
- Tests first (TDD) for dual-role access and passenger rate; existing ratings + passenger-trips suites stay green.
- English in code; conventional commits later (user signs with GPG).

**Ask First:**
- Changing trip status to `rated` when only the passenger rates (before driver rates) — default YES, mirror driver flow so complete→rated is consistent.
- Adding a new public route shape other than `POST /passenger/trips/:id/rate`.

**Never:**
- SOS UI, verification code UI, TripComplete wiring, chat, payment.
- Breaking driver app rating.
- Hardcoding role checks that ignore `'both'` elsewhere without fixing them if touched.
- Skipping tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dual-role request trip | user role `both`, valid body | 201/200 trip created | N/A |
| Dual-role active | user role `both`, active trip | 200 trip | N/A |
| Driver-only on passenger trip | user role `driver` only | 403 FORBIDDEN | AppError |
| Passenger rates driver | passenger of completed trip, rating 1–5 | 200, rating row, trip→rated, driver.rating_avg updated | N/A |
| Passenger rates twice | second POST same trip | 409 Conflict | ConflictError |
| Wrong passenger | another user rates trip | 404 | NotFoundError |
| Trip not completed | status accepted/etc. | 400 | BAD_REQUEST |
| estimateFare client | origin/dest + vehicle_type | POST `/maps/fare-estimate` with those fields | map response fields to FareEstimate type |

</frozen-after-approval>

## Code Map

- `apps/backend/src/features/passenger-trips/routes.ts` — local `requirePassenger`; add rate route
- `apps/backend/src/features/passenger-trips/service.ts` — trip ownership helpers; add `rateTrip` or delegate
- `apps/backend/src/features/passenger-trips/schema.ts` — rate body/params if needed
- `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` — dual-role + rate tests
- `apps/backend/src/features/ratings/service.ts` — reference for driver rate transaction shape
- `apps/backend/src/shared/middleware/roles.ts` — `both` expands to driver+passenger
- `apps/backend/src/features/maps/routes.ts` — `POST /maps/fare-estimate` (exists)
- `apps/mobile-passengers/src/api/passenger.ts` — fix `estimateFare` + `rateRide` paths/payloads
- `apps/mobile-passengers/src/api/types.ts` — align FareEstimate fields if backend shape differs

## Tasks & Acceptance

**Execution:**
- [x] `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` — RED: dual-role (`both`) can POST request + GET active; driver-only still 403
- [x] `apps/backend/src/features/passenger-trips/routes.ts` — GREEN: `requirePassenger` accepts `passenger` | `both` (same idea as roles.ts)
- [x] `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` — RED: passenger rate happy path + 409 + 400 + 404
- [x] `apps/backend/src/features/passenger-trips/service.ts` (+ schema/routes) — GREEN: `POST /:id/rate` passenger→driver
- [x] `apps/mobile-passengers/src/api/passenger.ts` — `estimateFare` → `POST /maps/fare-estimate` with origin/dest/vehicle_type; map response to client type
- [x] `apps/mobile-passengers/src/api/passenger.ts` — `rateRide` stays on `/passenger/trips/:id/rate` with `{ rating, comment? }` matching backend body
- [x] `apps/mobile-passengers/src/api/types.ts` — FareEstimate client mapping via estimateFare adapter (no type file change needed)
- [x] Run backend passenger-trips + ratings tests; mobile typecheck if available
- [x] Update sprint-status action items ai-1, ai-2 → done when verified

**Acceptance Criteria:**
- Given a user with derived role `both`, when they call passenger trip endpoints, then they are not rejected for role.
- Given a driver-only user, when they call those endpoints, then 403.
- Given a completed trip’s passenger, when they POST rate 1–5, then rating is stored against the driver and trip becomes `rated`.
- Given the passenger app client, when it estimates fare or rates, then it hits existing/new backend routes that succeed (no phantom `/passenger/rides/*`).

## Spec Change Log

## Design Notes

Prefer expanding `requirePassenger` inline (or a tiny shared `assertPassengerRole`) rather than Elysia `requireRole` middleware if current routes throw `AppError` via `safeCall` — keep error shape consistent.

Passenger rate should look up trip by `trips.passenger_id = user.id` and join `drivers` on `trips.driver_id` to get `drivers.user_id` as `ratee_id`. Do **not** call `getDriverId(user)`.

`estimateFare` client today sends `pickup_lat/lng` — backend expects `origin_lat/lng` + `vehicle_type`. Map in the client function signature as needed without breaking call sites (adapt VehicleSelect if it already uses getDirections only).

## Verification

**Commands:**
- `cd apps/backend && bun test src/features/passenger-trips/passenger-trips.test.ts` — all pass including new cases
- `cd apps/backend && bun test src/features/ratings/ratings.test.ts` — still pass
- `bun --filter @lifty/mobile-passengers typecheck` (or project equivalent) — no type errors from API changes

**Manual checks (if no CLI):**
- Grep mobile for `/passenger/rides` — zero hits after fix (code paths only; AGENTS.md still documents legacy names)

### Review Findings

- [x] [Review][Patch] Assert rating row fields in happy-path test (rater_id, ratee_id=driver.user_id, score, comment) [`passenger-trips.test.ts:340`]
- [x] [Review][Patch] Rename misleading test `GET /active returns 500 for non-passenger role` → `403` [`passenger-trips.test.ts:271`]
- [x] [Review][Patch] Cap `tags`/`comment` maxLength in rateTripBody to match DB varchar(255/500) [`schema.ts:20`]
- [x] [Review][Defer] Mutual passenger+driver rating blocked by shared completed→rated status — deferred, product (spec default YES) [`service.ts:295`]
- [x] [Review][Defer] No DB unique (trip_id, rater_id); concurrent insert race — deferred, pre-existing pattern [`ratings` schema]
- [x] [Review][Defer] rating_avg mixes dual-role ratee scores — deferred, same as driver ratings path [`service.ts:334`]
- [x] [Review][Defer] Concurrent rating_avg lost update without driver row lock — deferred, pre-existing [`service.ts:340`]

## Suggested Review Order

**Dual-role gate**

- Accept `passenger` and `both`; reject driver-only
  [`routes.ts:8`](../../apps/backend/src/features/passenger-trips/routes.ts#L8)

- History now uses the same gate
  [`routes.ts:38`](../../apps/backend/src/features/passenger-trips/routes.ts#L38)

**Passenger → driver rate**

- New route wired to service
  [`routes.ts:66`](../../apps/backend/src/features/passenger-trips/routes.ts#L66)

- Ownership, 409-before-status, avg update
  [`service.ts:267`](../../apps/backend/src/features/passenger-trips/service.ts#L267)

- Body schema 1–5
  [`schema.ts:20`](../../apps/backend/src/features/passenger-trips/schema.ts#L20)

**Client API alignment**

- Fare estimate → `/maps/fare-estimate` + vehicle map
  [`passenger.ts:19`](../../apps/mobile-passengers/src/api/passenger.ts#L19)

**Tests**

- Dual-role + rate matrix
  [`passenger-trips.test.ts:302`](../../apps/backend/src/features/passenger-trips/passenger-trips.test.ts#L302)
