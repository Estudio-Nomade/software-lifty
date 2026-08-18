# Cancellation Policy — Domain Engine + Existing Trip SM

**Date**: 2026-08-18
**Status**: Approved by user (design sections 1–4)
**Scope**: backend cancellation domain, debt, metrics/TVF, passenger + driver app surfaces, notifications. No admin UI. No MercadoPago SDK in this cut.

## Goal

Replace today’s free-cancel-until-arrival / nobody-can-cancel-after-arrival behavior with the product cancellation policy: timed grace, fixed $600 fee, passenger debt (phase 1) + charge interface (phase 2), no-show compensation, anti-abuse thresholds, and TVF that only punishes driver-initiated cancels.

Keep current screens and navigation. The engine lives in the backend; apps gain preview copy, timers, and gates.

## Background (current vs target)

Today:

- Passenger may cancel `pending` / `offered` / `accepted` / `en_route` for free. Blocked from `waiting`.
- Driver may cancel `accepted` / `en_route` for free. Blocked from `waiting`.
- `cancelled_early` / `cancelled_late` compensation in `transitionTrip` is unreachable (`waiting` only allows `in_trip`). Tests lock the 400.
- No passenger debt, no fee, no cancel reason persisted, no search auto-cancel.
- TVF = `completed / (completed + cancelled_early)` over 7 days. Always 1.0 in live flows.
- Passenger search UI timeout is 30 s and does not expire the trip.
- Arrival is manual «Llegué» + haversine ≤ 50 m.

This spec **replaces** Story 5.6 / the 5-minute passenger-fee copy / `cancelled_early|late` writes. Historical rows stay readable.

## Decisions locked

| Topic | Decision |
|---|---|
| Delivery | One spec covering engine + debt + metrics + apps |
| Architecture | Domain module + existing trip statuses (Approach A) |
| TVF | `completed / (completed + driver_cancels_that_count)` |
| TVF exclusions | Passenger cancel and driver no-show do **not** lower TVF |
| Collection | Phase 1 and phase 2 both specified; default `COLLECTION_PHASE=1` |
| Phase 1 driver credit | Lifty transfers $600 manually; system queues `driver_fee_payouts` |
| Phase 2 charge | `PaymentGateway` interface; MercadoPago adapter is out of this cut |
| Phase 2 failure | Fall back to phase-1 debt |
| Arrival | Existing «Llegué» button + GPS ≤ 50 m + accuracy check |
| In-trip cancel | Forbidden |
| Old statuses | Stop writing `cancelled_early` / `cancelled_late`. Always persist `cancelled` + `cancelation_log` |
| UI | Do not redesign flows; extend existing screens |
| Admin | Config keys in `platform_config` + ops API. No admin frontend |
| Currency | ARS integers (600, 2500, 3000) |

## Architecture

New feature module `apps/backend/src/features/cancellations/`:

| File | Responsibility |
|---|---|
| `config.ts` | Load typed config from `platform_config` (cached, TTL 30 s) |
| `evaluate.ts` | Pure `evaluateCancel(input) → CancelDecision`. No I/O |
| `service.ts` | Apply decision: transition, log, fee, debt, payout, metrics, notify |
| `timers.ts` | Search-timeout sweep (same 5 s loop as `expireStaleOffers`) |
| `metrics.ts` | Recalc passenger cancel rate + driver TVF over 30 days |
| `blocks.ts` | Evaluate and persist suspensions / matching blocks |
| `gateway.ts` | `PaymentGateway` interface + `NoopGateway` (phase 1) |
| `notifications.ts` | Canonical push/email copy |
| `schema.ts` | Drizzle tables listed below |

Existing endpoints stay:

- `POST /api/passenger/trips/:id/cancel` → `cancellations.service.cancelByPassenger`
- `POST /api/trips/:id/cancel` → `cancellations.service.cancelByDriver` (reason `driver_cancel` or `no_show`)

New endpoints:

- `GET /api/passenger/trips/:id/cancel-preview` → fee, phase, copy, `can_cancel`
- `GET /api/passenger/debt` → current debt + block state
- `POST /api/trips/:id/cancel` body `{ reason: 'driver_cancel' \| 'no_show' }` (required)

`requestTrip` calls `assertPassengerCanRequest(userId)` before insert.

Matching (`findNearbyDrivers`) excludes drivers with an active `tvf_review` block.

### State mapping

| Policy stage | Live statuses | Clock start |
|---|---|---|
| Pre-asignación | `pending`, `offered` | `trips.created_at` |
| En camino | `accepted`, `en_route` | `trips.assigned_at` (new column, set on `accepted`) |
| Llegado | `waiting` | `trips.waiting_since` (exists) |
| En viaje / terminal | `in_trip`, `completed`, `rated`, any `cancelled*` | no cancel |

`request_received` (legacy driver-created) follows the same rules as `accepted` if `assigned_at` is set, else as pre-asignación.

## Cancel decision table

`evaluateCancel` is the single source of truth.

| Current status | Actor | Condition | `can_cancel` | `fee_ars` | `credit_driver` | `counts_for_tvf` | `reason` | `stage` |
|---|---|---|---|---|---|---|---|---|
| `pending` / `offered` | passenger | always | yes | 0 | no | no | `user_cancel` | `pre_asignacion` |
| `pending` / `offered` | system | `now - created_at ≥ SEARCH_TIMEOUT_S` | yes | 0 | no | no | `auto_timeout` | `pre_asignacion` |
| `accepted` / `en_route` | passenger | `now - assigned_at < GRACE_S` | yes | 0 | no | no | `user_cancel` | `en_camino` |
| `accepted` / `en_route` | passenger | `now - assigned_at ≥ GRACE_S` | yes | 600 | yes | no | `user_cancel` | `en_camino` |
| `accepted` / `en_route` | driver | always | yes | 0 | no | **yes** | `driver_cancel` | `en_camino` |
| `waiting` | passenger | always | yes | 600 | yes | no | `user_cancel` | `llegado` |
| `waiting` | driver | `now - waiting_since < WAIT_S` | **no** | — | — | — | — | — |
| `waiting` | driver | `now - waiting_since ≥ WAIT_S` | yes | 600 | yes | **no** | `no_show` | `llegado` |
| `in_trip`+ | anyone | always | no | — | — | — | — | — |

Rules:

- One fee per trip: if `cancelation_log` already has `fee_applied > 0` for that `trip_id`, do not apply another.
- Target status is always `cancelled`. Never write `cancelled_early` / `cancelled_late`.
- `VALID_TRANSITIONS` must allow `waiting → cancelled`.
- Remove the `waiting` remap to `cancelled_early`/`cancelled_late` in `transitionTrip`.
- Tests 7 and 8 in `trips.test.ts` (waiting cancel → 400) are rewritten to the table above.

## Data model

### `trips` (alter)

- `assigned_at timestamptz null` — set once when status becomes `accepted`. Never overwrite.
- Existing `waiting_since`, `tolerance_minutes` remain. Wait clock uses `waiting_since` and config `WAIT_S`, not `tolerance_minutes`. `tolerance_minutes` is ignored by the new engine (left in place, unused).

### `cancelation_log`

```
id              uuid pk
trip_id         uuid not null unique   -- one row per cancelled trip
user_id         uuid not null          -- passenger
driver_id       uuid null
stage           varchar  -- pre_asignacion | en_camino | llegado
reason          varchar  -- user_cancel | auto_timeout | no_show | driver_cancel
actor           varchar  -- passenger | driver | system
fee_applied     integer not null       -- 0 or 600
credit_driver   boolean not null
counts_for_tvf  boolean not null
collection_phase integer not null
cancelation_time timestamptz not null
created_at      timestamptz not null
```

Unique on `trip_id` enforces one cancel record (and therefore one fee) per trip.

### `user_debt`

```
user_id         uuid pk  -- passenger
amount_ars      integer not null default 0
status          varchar  -- pending | paid | blocked
last_notified_2500_at timestamptz null
updated_at      timestamptz not null
```

`blocked` is a denormalized hint. Source of request-blocking is `amount_ars >= DEBT_BLOCK_ARS` **or** an active `user_blocks` row.

### `driver_fee_payouts`

```
id              uuid pk
trip_id         uuid not null unique
driver_id       uuid not null
amount_ars      integer not null       -- always 600
status          varchar  -- pending | ready | paid
-- pending: phase 1, Lifty still owes a manual transfer
-- ready:   phase 2 charge succeeded, funds collected, still mark paid when transferred/credited
-- paid:    Lifty marked transferred (phase 1) or auto-credited (phase 2)
collection_phase integer not null
created_at      timestamptz not null
paid_at         timestamptz null
```

No driver wallet ledger in this cut. Ops (or a later admin tool) flip `pending`/`ready` → `paid`.

### `user_blocks`

```
id              uuid pk
subject_type    varchar  -- passenger | driver
subject_id      uuid not null
kind            varchar  -- debt | cancel_rate_72h | cancel_rate_review | tvf_review
starts_at       timestamptz not null
ends_at         timestamptz null      -- null = until manual clear
created_at      timestamptz not null
```

Active block = `starts_at ≤ now` AND (`ends_at is null` OR `ends_at > now`).

### `user_cancelation_metrics` / `driver_tvf_metrics`

Materialized snapshots, recomputed on every relevant cancel/complete. Not the source of truth — `cancelation_log` + `trips` are. Snapshots exist so offer payloads and admin reads stay cheap.

```
user_cancelation_metrics
  user_id, period_days (30), total_trips_requested, total_cancelations,
  pre_assign_cancelations, cancelation_rate_bp, updated_at

driver_tvf_metrics
  driver_id, period_days (30), total_completed, total_tvf_cancels,
  tvf_rate_bp, updated_at
```

Rates stored as **basis points** (3010 = 30.10%) to avoid float drift. API returns percent with 1 decimal.

### Config keys (`platform_config`)

| Key | Default | Meaning |
|---|---|---|
| `cancel.grace_s` | `120` | Free passenger cancel after assignment |
| `cancel.wait_s` | `300` | Free wait after GPS arrival; then no-show allowed |
| `cancel.search_timeout_s` | `300` | Auto-cancel if still `pending`/`offered` |
| `cancel.fee_ars` | `600` | Fixed fee |
| `cancel.arrival_radius_m` | `50` | «Llegué» max distance |
| `cancel.gps_accuracy_max_m` | `50` | Reject arrive if reported accuracy worse than this |
| `cancel.debt_warn_ars` | `2500` | Push when crossing this amount |
| `cancel.debt_block_ars` | `3000` | Block new requests |
| `cancel.collection_phase` | `1` | `1` debt, `2` attempt gateway then debt |
| `cancel.passenger_window_days` | `30` | Cancel-rate window |
| `cancel.passenger_min_trips` | `5` | Min requested trips before rate actions fire |
| `cancel.passenger_warn_bp` | `3000` | >30% |
| `cancel.passenger_suspend_bp` | `4000` | >40% → 72 h |
| `cancel.passenger_review_bp` | `5000` | >50% → review flag |
| `cancel.suspend_hours` | `72` | Duration of 40% block |
| `cancel.visibility_min_cancels` | `5` | Hide % on accept below this |
| `cancel.tvf_window_days` | `30` | TVF window |
| `cancel.tvf_warn_bp` | `7000` | <70% |
| `cancel.tvf_block_bp` | `5000` | <50% |
| `cancel.tick_ms` | `5000` | Timer sweep interval |

`passenger_min_trips = 5` is an explicit design resolution: 1 cancel out of 1 request is 100% and must not auto-suspend. Same floor as the driver-visibility sample.

## Collection

### Apply fee (shared)

```
if decision.fee_ars == 0: return
if trip already has fee_applied > 0: return
if collection_phase == 2:
  charged = await gateway.chargeFee(passengerId, fee_ars, tripId)
  if charged: write debt unchanged; payout status = ready; return
# phase 1, or phase 2 failure
user_debt.amount_ars += fee_ars
user_debt.status = amount >= DEBT_BLOCK_ARS ? blocked : pending
insert driver_fee_payouts (pending, 600)
if previous_amount < 2500 <= new_amount: notify debt warning
if new_amount >= 3000: notify debt block
```

`PaymentGateway`:

```ts
interface PaymentGateway {
  chargeFee(userId: string, amountArs: number, tripId: string): Promise<boolean>
}
```

Phase 1 uses `NoopGateway` that always returns `false`. Phase 2 adapter (MercadoPago) is a later ticket; flipping `cancel.collection_phase` to `2` without an adapter is a no-op (always falls back to debt).

### Debt on next trip (phase 1)

On `completeTrip` / `collectTrip` for a passenger with `amount_ars > 0`:

- Response and trip payload include `debt_applied_ars = user_debt.amount_ars` and `total_due_ars = total_fare + debt_applied_ars`.
- After the trip is `completed` and marked collected (`is_collected = true`), set `user_debt.amount_ars = 0`, `status = paid`.
- If the next trip is cancelled, debt is **not** cleared. A new fee may stack (one fee per trip, many trips).
- Self-serve pay-down **only** works while `amount_ars < DEBT_BLOCK_ARS`. At/above 3000 the passenger cannot request, so they cannot clear debt by riding. Support must mark the debt paid (see Ops endpoints) after the passenger regularizes offline.

### Request gate

`assertPassengerCanRequest`:

1. If `user_debt.amount_ars >= DEBT_BLOCK_ARS` → `403 DEBT_BLOCKED` with amount and support copy.
2. If active `cancel_rate_72h` block → `403 PASSENGER_SUSPENDED` with `ends_at`.
3. If active `cancel_rate_review` block → `403 PASSENGER_UNDER_REVIEW`.
4. If `DEBT_WARN_ARS ≤ amount < DEBT_BLOCK_ARS` → allow, include `debt_warning` in the `requestTrip` response (client shows the aviso).

## Metrics and blocks

### Passenger cancel rate

Window = last `passenger_window_days` (30).

- `total_trips_requested` = trips with `passenger_id = user` created in window.
- `total_cancelations` = `cancelation_log` rows in window where `actor = passenger` and `reason = user_cancel`.
- `pre_assign_cancelations` = those with `stage = pre_asignacion` (separate counter; does not change the rate formula).
- System `auto_timeout` and driver `no_show` / `driver_cancel` **do not** count as passenger cancels.
- `rate_bp = total_cancelations * 10000 / total_trips_requested` (0 if requested = 0).

Actions, only if `total_trips_requested >= passenger_min_trips`:

| Condition | Action | Once per crossing |
|---|---|---|
| `rate_bp > 3000` | Push + email warning | Yes (dedupe 24 h) |
| `rate_bp > 4000` | Insert `cancel_rate_72h` block for `suspend_hours` | Refresh `ends_at` only if no active block |
| `rate_bp > 5000` | Insert `cancel_rate_review` (no `ends_at`) | Yes, until support clears |

Recalc after every passenger `user_cancel` and every new `requestTrip` (so the denominator moves).

### Driver TVF

Window = last `tvf_window_days` (30).

- `total_completed` = trips `status = completed` (or `rated`) with this `driver_id` whose `updated_at` (completion) is in window.
- `total_tvf_cancels` = `cancelation_log` rows in window where `driver_id` matches and `counts_for_tvf = true`.
- `tvf_rate_bp = total_completed * 10000 / (total_completed + total_tvf_cancels)` (10000 if denominator is 0).

Historical `trips.status = cancelled_early` (if any) count as `counts_for_tvf = true` during backfill only. Live writes never create those statuses.

| Condition | Action |
|---|---|
| `tvf_rate_bp < 7000` and denominator > 0 | In-app + push warning (dedupe 24 h) |
| `tvf_rate_bp < 5000` and denominator > 0 | Insert `tvf_review` block (no `ends_at`). Driver cannot receive offers until support clears |

Recalc after driver `driver_cancel`, after `no_show` (should not change TVF), after `completed`.

### Driver visibility (accept screen)

Offer payload / `GET /trips/:id` for the assigned driver includes:

```
passenger_cancel_visible: boolean
passenger_cancel_rate_pct: number | null   // 1 decimal
passenger_cancel_count_30d: number | null
```

`visible` is true only when `total_cancelations >= visibility_min_cancels` (5). Otherwise all three display fields are `null` / false.

Never include cancel reasons, disputes, full name beyond what the offer already shows, or addresses beyond the trip pickup.

Copy:

`Este pasajero tiene un {rate}% de cancelación en los últimos 30 días ({count} cancelaciones).`

## Timers

Same process interval as offer expiry (`index.ts`, 5 s, config `cancel.tick_ms`):

1. Existing `expireStaleOffers` (20 s offer → rematch). Unchanged.
2. New `expireSearchTimeouts`: any trip still `pending` or `offered` with `now - created_at ≥ SEARCH_TIMEOUT_S` → system cancel (`auto_timeout`, fee 0). Rematch stops because the trip is terminal.

Wall-clock is from `created_at`, including rematch cycles.

Wait / grace are **not** background jobs. They are evaluated at cancel/preview time from `assigned_at` / `waiting_since`.

## Arrival

`arrivedTrip` already requires haversine ≤ 50 m. Add:

- Client sends `gps_accuracy_m` on `POST /trips/:id/arrived`.
- If `gps_accuracy_m` is missing or `> gps_accuracy_max_m` → `400 GPS_ACCURACY`.
- Radius stays `arrival_radius_m` (50).
- No auto-transition. Button stays.

Set `waiting_since = now()` on success (already happens).

## Apps (extend, don’t replace)

### Passenger — `apps/mobile-passengers`

`ConnectingDriverScreen`

- Drop the 30 s local timeout as the source of truth.
- Show countdown from `created_at + search_timeout_s` (default 300).
- On realtime `cancelled` / `auto_timeout`, show “No se encontró conductor” and go home.
- Cancel button → preview (fee 0) → confirm.

`TripInProgressScreen`

- Cancel visible for `accepted`, `en_route`, **and** `waiting`.
- Before confirm, `GET cancel-preview`. Use backend copy:
  - fee 0: “Cancelación sin costo. ¿Confirmas?”
  - fee 600 + phase 1: “Cancelación con multa de $600. Se agregarán $600 a tu próximo viaje. ¿Confirmas?”
  - fee 600 + phase 2: “Cancelación con multa de $600. Se cobrarán $600 automáticamente. ¿Confirmas?”
- Hidden for `in_trip`.

`VehicleSelect` / `requestRide`

- Handle `403 DEBT_BLOCKED` / `PASSENGER_SUSPENDED` / `PASSENGER_UNDER_REVIEW` with the spec copies.
- If response includes `debt_warning`, show: `Tienes ${amount} de deuda. Próximo viaje incluirá ese monto.`

`TripHistoryScreen`

- “Contactar soporte” on cancelled rows → existing Support screen. No in-app dispute.

Register FCM/Expo token the same way the driver app does (`POST /api/notifications/token`) so passenger pushes actually send.

### Driver — `apps/mobile`

`IncomingRequestScreen`

- If `passenger_cancel_visible`, show the percent line. Otherwise show nothing extra.

`NavigationScreen`

- Keep “Cancelar viaje”. Confirm still cancels with `reason: 'driver_cancel'` (TVF hit, $0).

`WaitingPassengerScreen`

- Keep the 5:00 countdown.
- After 0, enable “Cancelar por no-show” → `reason: 'no_show'`.
- Success copy: “Has recibido $600 por concepto de cancelación.” (phase 1: “Lifty te transferirá $600.”)
- State that this cancel does not affect TVF (already true in the engine).

No cancel on `TripInProgressScreen`.

## Notifications

All via `sendPushToUser` + in-app realtime already used for trip status. Email via existing Resend for the two passenger warning/review events.

| Event | To | Title / body (canonical) |
|---|---|---|
| Fee applied | passenger | “Tu viaje fue cancelado. Se aplicó un cargo de $600 por cancelación tardía.” |
| Driver arrived | passenger | “Tu conductor ha llegado al punto de encuentro. Tienes 5 minutos para subir.” |
| No-show | passenger | “El conductor canceló el viaje por no-show. Se te cobrarán $600.” |
| Debt ≥ 2500 | passenger | “Has acumulado $X en deuda por cancelaciones. Si llegas a $3000 no podrás solicitar viajes.” |
| Debt ≥ 3000 | passenger | “Tienes $X en deuda. No puedes solicitar viajes hasta regularizar tu saldo.” |
| Cancel rate > 30% | passenger | “Has cancelado más del 30% de tus viajes en los últimos 30 días. Si continúas, podrías ser suspendido.” |
| TVF < 70% | driver | “Tu TVF está por debajo del 70%. Si baja del 50%, tu cuenta será desactivada.” |
| Passenger cancelled (existing) | driver | Keep current “El pasajero ha cancelado el viaje.” |
| Driver cancelled / no-show | passenger | Also emit realtime `trip:status` (today driver-cancel has no passenger push — add it). |

Replace `{X}` with the actual `user_debt.amount_ars` at send time. Do not hardcode 2500/3000 in the debt-crossed copies when the amount is higher.

## Error handling

| Code | HTTP | When |
|---|---|---|
| `CANCEL_NOT_ALLOWED` | 409 | Status forbids cancel (e.g. `in_trip`) |
| `NO_SHOW_TOO_EARLY` | 400 | Driver no-show before `WAIT_S` |
| `FEE_ALREADY_APPLIED` | 409 | Second fee attempt (should be unreachable) |
| `DEBT_BLOCKED` | 403 | Debt ≥ 3000 on request |
| `PASSENGER_SUSPENDED` | 403 | 72 h block |
| `PASSENGER_UNDER_REVIEW` | 403 | >50% review flag |
| `DRIVER_TVF_BLOCKED` | — | Matching skip only (no HTTP to passenger) |
| `TOO_FAR_FROM_PICKUP` | 400 | Existing |
| `GPS_ACCURACY` | 400 | Missing/poor accuracy on arrive |
| `TRIP_NOT_FOUND` / `FORBIDDEN` | 404/403 | Existing ownership checks |

All cancel paths write `trip_events` as today, plus `cancelation_log`.

## Ops endpoints (API only, no UI)

Existing admin auth. Needed so phase 1 is operable without SQL:

- `POST /api/admin/cancellations/debt/:userId/clear` — set `user_debt.amount_ars = 0`, `status = paid`.
- `POST /api/admin/cancellations/blocks/:id/clear` — set `ends_at = now()` (72 h, review, TVF).
- `POST /api/admin/cancellations/payouts/:id/paid` — set payout `paid` + `paid_at`.
- `GET /api/admin/cancellations/config` / `PUT` — read/write the `cancel.*` keys.

Support “Contactar soporte” remains the passenger path into these actions.

## Testing (Given / When / Then)

Backend, new `cancellations/*.test.ts` plus updates to `trips.test.ts` / `passenger-trips.test.ts` / `earnings.test.ts`.

1. Given `pending`, when passenger cancels, then status `cancelled`, fee 0, no debt, log `pre_asignacion`.
2. Given `pending` for 300 s, when tick runs, then `auto_timeout`, fee 0.
3. Given `accepted` at t=0, when passenger cancels at t=119 s, then fee 0.
4. Given `accepted` at t=0, when passenger cancels at t=121 s, then fee 600, debt +600, payout `pending`.
5. Given `waiting`, when passenger cancels, then fee 600.
6. Given `waiting` at t=299 s, when driver sends `no_show`, then 400 `NO_SHOW_TOO_EARLY`.
7. Given `waiting` at t=301 s, when driver sends `no_show`, then fee 600, `counts_for_tvf=false`, passenger notified.
8. Given `accepted`, when driver cancels, then fee 0, `counts_for_tvf=true`.
9. Given `in_trip`, when either side cancels, then 409.
10. Given a trip that already has `fee_applied=600`, when another fee path runs, then amount unchanged.
11. Given debt 2400, when a 600 fee applies, then debt 3000, warn+block notifications, next `requestTrip` is 403.
12. Given debt 600 and phase 1, when next trip is collected, then debt 0 and payload included `debt_applied_ars=600`.
13. Given phase 2 and gateway success, when fee applies, then debt unchanged and payout `ready`.
14. Given phase 2 and gateway failure, when fee applies, then same as phase 1.
15. Given 5 requested / 2 passenger cancels (40%+), when rate recalc, then 72 h block. Auto-timeouts in the window do not count.
16. Given 4 requested / 4 cancels, when rate recalc, then **no** suspend (`min_trips=5`).
17. Given 2 completed + 2 `driver_cancel`, when TVF recalc, then 50% → `tvf_review` block. A `no_show` in the window does not change TVF.
18. Given passenger with 4 cancels in 30 d, when offer is built, then `passenger_cancel_visible=false`. At 5, visible with rate.
19. Given arrive with accuracy 80 m, when `arrivedTrip`, then 400. At 30 m and distance 40 m, then `waiting`.

Passenger app: preview copy on confirm; debt 403 on request; ConnectingDriver uses 300 s / server cancel.

Driver app: no-show button disabled until 0; accept screen hides % below 5 cancels.

## Non-goals

- Admin panel UI for config, debt, or payouts.
- MercadoPago (or any) passenger card charge implementation.
- Driver wallet ledger / automatic bank transfer.
- Auto-arrive without the button.
- Cancel during `in_trip`.
- Automatic fee exemption or in-app dispute resolution.
- Rewriting trip status names (`searching` / `assigned` / `arrived`).
- Changing matching radius, offer timeout (20 s), or rematch algorithm — except excluding TVF-blocked drivers and stopping rematch after search timeout.

## Rollout

1. Schema + config defaults + pure `evaluateCancel` + tests.
2. Wire passenger/driver cancel + `waiting → cancelled` + stop writing old statuses.
3. Debt + payouts + request gate + next-trip attachment.
4. Timers (search 300 s) + arrival accuracy.
5. Metrics, blocks, matching exclusion, offer visibility fields.
6. Notifications + passenger push token.
7. App preview / no-show / copy. Flip `collection_phase` only after a real gateway exists.
