# Cancellation Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved cancellation policy (grace 120s, fee $600, phase-1 debt, no-show, TVF, anti-abuse, app surfaces) on top of the existing trip state machine.

**Architecture:** Pure `evaluateCancel` + `cancellations` feature module. Existing `POST .../cancel` endpoints delegate to it. Timers ride the 5s offer-expirer loop. Phase 2 is a `PaymentGateway` interface (`NoopGateway` always fails → debt). Do not rewrite trip statuses or matching.

**Tech Stack:** Bun, Elysia, Drizzle, PostgreSQL, bun:test, Expo apps `mobile` + `mobile-passengers`.

**Spec:** `docs/superpowers/specs/2026-08-18-cancellation-policy-design.md`

## Global Constraints

- Always persist `status = 'cancelled'`. Never write `cancelled_early` or `cancelled_late`.
- One fee per trip (`cancelation_log.trip_id` unique).
- TVF = `completed / (completed + driver_cancels_that_count)`. Passenger cancel and no-show do not lower TVF.
- Default `cancel.collection_phase = 1` (debt + manual Lifty→driver transfer).
- Arrival stays button + GPS ≤ 50 m + accuracy ≤ 50 m.
- No cancel from `in_trip`+.
- Keep current screens; extend copy/timers/gates only.
- No MercadoPago SDK. No admin frontend.
- Tests: `cd apps/backend && bun test <file>`.
- Do not commit unless the human asks. Leave changes unstaged for a later `git add` / commit / push / PR.
- Currency ARS integers. Rates in basis points internally.

---

## File map

**Create**

- `apps/backend/src/features/cancellations/types.ts`
- `apps/backend/src/features/cancellations/config.ts`
- `apps/backend/src/features/cancellations/evaluate.ts`
- `apps/backend/src/features/cancellations/evaluate.test.ts`
- `apps/backend/src/features/cancellations/gateway.ts`
- `apps/backend/src/features/cancellations/notifications.ts`
- `apps/backend/src/features/cancellations/metrics.ts`
- `apps/backend/src/features/cancellations/blocks.ts`
- `apps/backend/src/features/cancellations/service.ts`
- `apps/backend/src/features/cancellations/service.test.ts`
- `apps/backend/src/features/cancellations/timers.ts`
- `apps/backend/src/features/cancellations/routes.ts`
- `apps/backend/src/shared/db/schema/cancelation-log.ts`
- `apps/backend/src/shared/db/schema/user-debt.ts`
- `apps/backend/src/shared/db/schema/driver-fee-payouts.ts`
- `apps/backend/src/shared/db/schema/user-blocks.ts`
- `apps/backend/src/shared/db/schema/user-cancelation-metrics.ts`
- `apps/backend/src/shared/db/schema/driver-tvf-metrics.ts`
- `apps/backend/supabase/migrations/<ts>_cancellation_policy.sql`

**Modify**

- `apps/backend/src/shared/db/schema/trips.ts` — add `assigned_at`
- `apps/backend/src/shared/db/schema/index.ts` — export new tables
- `apps/backend/src/features/trips/service.ts` — transitions, `assigned_at`, arrive accuracy, collect debt, cancel delegate
- `apps/backend/src/features/trips/schema.ts` — `gps_accuracy_m`, cancel body
- `apps/backend/src/features/trips/routes.ts` — pass cancel reason + accuracy
- `apps/backend/src/features/trips/trips.test.ts` — tests 7/8
- `apps/backend/src/features/passenger-trips/service.ts` — request gate, cancel delegate
- `apps/backend/src/features/passenger-trips/routes.ts` — preview + debt
- `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` — waiting cancel allowed
- `apps/backend/src/features/passenger-trips/matching.service.ts` — exclude TVF-blocked; attach visibility
- `apps/backend/src/features/earnings/service.ts` — 30-day TVF from log
- `apps/backend/src/features/earnings/earnings.test.ts` — window + formula
- `apps/backend/src/features/admin/routes.ts` — ops endpoints
- `apps/backend/src/index.ts` — mount routes + search-timeout tick
- `apps/mobile-passengers/src/api/passenger.ts` — preview, debt
- `apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx`
- `apps/mobile-passengers/src/screens/TripInProgressScreen.tsx`
- `apps/mobile-passengers/src/screens/TripHistoryScreen.tsx`
- `apps/mobile/src/screens/WaitingPassengerScreen.tsx`
- `apps/mobile/src/screens/IncomingRequestScreen.tsx`
- `apps/mobile/src/screens/NavigationScreen.tsx`

---

### Task 1: Types, config, pure `evaluateCancel`

**Files:**
- Create: `apps/backend/src/features/cancellations/types.ts`
- Create: `apps/backend/src/features/cancellations/config.ts`
- Create: `apps/backend/src/features/cancellations/evaluate.ts`
- Test: `apps/backend/src/features/cancellations/evaluate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CancellationConfig` (all `cancel.*` defaults)
  - `DEFAULT_CANCELLATION_CONFIG`
  - `parseCancellationConfig(rows: {key:string;value:string}[]): CancellationConfig`
  - `EvaluateCancelInput`, `CancelDecision`
  - `evaluateCancel(input: EvaluateCancelInput): CancelDecision`

- [ ] **Step 1: Write the failing tests**

```ts
process.env.NODE_ENV = 'test';
import { describe, expect, test } from 'bun:test';
import { DEFAULT_CANCELLATION_CONFIG } from './config';
import { evaluateCancel } from './evaluate';

const cfg = DEFAULT_CANCELLATION_CONFIG;
const t0 = new Date('2026-08-18T12:00:00.000Z');

function input(over: Partial<Parameters<typeof evaluateCancel>[0]>) {
  return {
    status: 'pending',
    actor: 'passenger' as const,
    reason: 'user_cancel' as const,
    now: t0,
    createdAt: t0,
    assignedAt: null,
    waitingSince: null,
    config: cfg,
    ...over,
  };
}

describe('evaluateCancel', () => {
  test('passenger pending → fee 0', () => {
    const d = evaluateCancel(input({ status: 'pending' }));
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.reason).toBe('user_cancel');
    expect(d.stage).toBe('pre_asignacion');
    expect(d.countsForTvf).toBe(false);
  });

  test('system pending before timeout → cannot', () => {
    const d = evaluateCancel(input({ actor: 'system', reason: 'auto_timeout', status: 'pending' }));
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('CANCEL_NOT_ALLOWED');
  });

  test('system pending at 300s → auto_timeout fee 0', () => {
    const d = evaluateCancel(
      input({
        actor: 'system',
        reason: 'auto_timeout',
        status: 'offered',
        now: new Date(t0.getTime() + 300_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.reason).toBe('auto_timeout');
  });

  test('passenger accepted at 119s → fee 0', () => {
    const d = evaluateCancel(
      input({
        status: 'accepted',
        assignedAt: t0,
        now: new Date(t0.getTime() + 119_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.stage).toBe('en_camino');
  });

  test('passenger accepted at 121s → fee 600 credit driver', () => {
    const d = evaluateCancel(
      input({
        status: 'accepted',
        assignedAt: t0,
        now: new Date(t0.getTime() + 121_000),
      }),
    );
    expect(d.feeArs).toBe(600);
    expect(d.creditDriver).toBe(true);
    expect(d.countsForTvf).toBe(false);
  });

  test('driver accepted → fee 0 counts for TVF', () => {
    const d = evaluateCancel(
      input({ status: 'accepted', actor: 'driver', reason: 'driver_cancel', assignedAt: t0 }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(0);
    expect(d.countsForTvf).toBe(true);
  });

  test('passenger waiting → fee 600', () => {
    const d = evaluateCancel(input({ status: 'waiting', waitingSince: t0 }));
    expect(d.feeArs).toBe(600);
    expect(d.stage).toBe('llegado');
  });

  test('driver no-show at 299s → NO_SHOW_TOO_EARLY', () => {
    const d = evaluateCancel(
      input({
        status: 'waiting',
        actor: 'driver',
        reason: 'no_show',
        waitingSince: t0,
        now: new Date(t0.getTime() + 299_000),
      }),
    );
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('NO_SHOW_TOO_EARLY');
  });

  test('driver no-show at 301s → fee 600 not TVF', () => {
    const d = evaluateCancel(
      input({
        status: 'waiting',
        actor: 'driver',
        reason: 'no_show',
        waitingSince: t0,
        now: new Date(t0.getTime() + 301_000),
      }),
    );
    expect(d.canCancel).toBe(true);
    expect(d.feeArs).toBe(600);
    expect(d.creditDriver).toBe(true);
    expect(d.countsForTvf).toBe(false);
    expect(d.reason).toBe('no_show');
  });

  test('in_trip → CANCEL_NOT_ALLOWED', () => {
    const d = evaluateCancel(input({ status: 'in_trip' }));
    expect(d.canCancel).toBe(false);
    expect(d.code).toBe('CANCEL_NOT_ALLOWED');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`evaluateCancel` not defined)

```bash
cd apps/backend && bun test src/features/cancellations/evaluate.test.ts
```

- [ ] **Step 3: Implement types, config, evaluate**

`types.ts`:

```ts
export type CancelActor = 'passenger' | 'driver' | 'system';
export type CancelReason = 'user_cancel' | 'auto_timeout' | 'no_show' | 'driver_cancel';
export type CancelStage = 'pre_asignacion' | 'en_camino' | 'llegado';
export type CancelErrorCode =
  | 'CANCEL_NOT_ALLOWED'
  | 'NO_SHOW_TOO_EARLY'
  | 'FEE_ALREADY_APPLIED'
  | 'DEBT_BLOCKED'
  | 'PASSENGER_SUSPENDED'
  | 'PASSENGER_UNDER_REVIEW'
  | 'GPS_ACCURACY';

export interface CancellationConfig {
  graceS: number;
  waitS: number;
  searchTimeoutS: number;
  feeArs: number;
  arrivalRadiusM: number;
  gpsAccuracyMaxM: number;
  debtWarnArs: number;
  debtBlockArs: number;
  collectionPhase: 1 | 2;
  passengerWindowDays: number;
  passengerMinTrips: number;
  passengerWarnBp: number;
  passengerSuspendBp: number;
  passengerReviewBp: number;
  suspendHours: number;
  visibilityMinCancels: number;
  tvfWindowDays: number;
  tvfWarnBp: number;
  tvfBlockBp: number;
  tickMs: number;
}

export interface EvaluateCancelInput {
  status: string;
  actor: CancelActor;
  reason: CancelReason;
  now: Date;
  createdAt: Date;
  assignedAt: Date | null;
  waitingSince: Date | null;
  config: CancellationConfig;
}

export interface CancelDecision {
  canCancel: boolean;
  feeArs: number;
  creditDriver: boolean;
  countsForTvf: boolean;
  reason: CancelReason;
  stage: CancelStage;
  code?: CancelErrorCode;
  copyKey?: 'free' | 'fee_phase1' | 'fee_phase2';
}
```

`config.ts` — `DEFAULT_CANCELLATION_CONFIG` with spec defaults (`graceS: 120`, `waitS: 300`, `searchTimeoutS: 300`, `feeArs: 600`, `arrivalRadiusM: 50`, `gpsAccuracyMaxM: 50`, `debtWarnArs: 2500`, `debtBlockArs: 3000`, `collectionPhase: 1`, `passengerWindowDays: 30`, `passengerMinTrips: 5`, `passengerWarnBp: 3000`, `passengerSuspendBp: 4000`, `passengerReviewBp: 5000`, `suspendHours: 72`, `visibilityMinCancels: 5`, `tvfWindowDays: 30`, `tvfWarnBp: 7000`, `tvfBlockBp: 5000`, `tickMs: 5000`).

`parseCancellationConfig` maps `cancel.grace_s` → `graceS` etc. Missing keys keep defaults. `Number.parseInt` / coerce `collectionPhase` to `1 | 2`.

`evaluate.ts` implements the spec decision table exactly. Pre-assign statuses: `pending`, `offered`. En-camino: `accepted`, `en_route`, `request_received` (if `assignedAt` set; else treat as pre-assign). Llegado: `waiting`. Forbidden: everything else including `in_trip`, `completed`, `rated`, `cancelled*`.

Copy key: `feeArs === 0` → `free`; else phase 1 → `fee_phase1`; phase 2 → `fee_phase2`.

Denied decisions still set `reason`/`stage` from the attempted cell; `feeArs: 0`, `canCancel: false`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/backend && bun test src/features/cancellations/evaluate.test.ts
```

---

### Task 2: Schema + migration

**Files:**
- Create schema files listed in the file map
- Modify: `apps/backend/src/shared/db/schema/trips.ts` (add `assigned_at: timestamp('assigned_at')`)
- Modify: `apps/backend/src/shared/db/schema/index.ts`
- Create: `apps/backend/supabase/migrations/20260818220000_cancellation_policy.sql`

**Interfaces:**
- Consumes: Task 1 types for varchar unions
- Produces: drizzle tables `cancelationLog`, `userDebt`, `driverFeePayouts`, `userBlocks`, `userCancelationMetrics`, `driverTvfMetrics`; `trips.assigned_at`

- [ ] **Step 1: Write SQL migration**

```sql
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE TABLE IF NOT EXISTS cancelation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id),
  user_id uuid NOT NULL,
  driver_id uuid,
  stage varchar(30) NOT NULL,
  reason varchar(30) NOT NULL,
  actor varchar(20) NOT NULL,
  fee_applied integer NOT NULL,
  credit_driver boolean NOT NULL,
  counts_for_tvf boolean NOT NULL,
  collection_phase integer NOT NULL,
  cancelation_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_debt (
  user_id uuid PRIMARY KEY,
  amount_ars integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'pending',
  last_notified_2500_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_fee_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips(id),
  driver_id uuid NOT NULL,
  amount_ars integer NOT NULL,
  status varchar(20) NOT NULL,
  collection_phase integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(20) NOT NULL,
  subject_id uuid NOT NULL,
  kind varchar(40) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_blocks_subject_idx ON user_blocks (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS user_cancelation_metrics (
  user_id uuid PRIMARY KEY,
  period_days integer NOT NULL DEFAULT 30,
  total_trips_requested integer NOT NULL DEFAULT 0,
  total_cancelations integer NOT NULL DEFAULT 0,
  pre_assign_cancelations integer NOT NULL DEFAULT 0,
  cancelation_rate_bp integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_tvf_metrics (
  driver_id uuid PRIMARY KEY,
  period_days integer NOT NULL DEFAULT 30,
  total_completed integer NOT NULL DEFAULT 0,
  total_tvf_cancels integer NOT NULL DEFAULT 0,
  tvf_rate_bp integer NOT NULL DEFAULT 10000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Mirror the same SQL under `apps/backend/src/shared/db/migrations/` if that folder is still kept in sync (check neighboring files; if present, duplicate).

- [ ] **Step 2: Drizzle table files** matching columns above (uuid/varchar/integer/boolean/timestamp). Export from `schema/index.ts`. Add `assigned_at` on `trips`.

- [ ] **Step 3: Apply locally**

```bash
cd apps/backend && bun test src/features/cancellations/evaluate.test.ts
```

If tests use a real Postgres (`TEST_DATABASE_URL` / localhost:5433), apply the SQL to that DB before later integration tests:

```bash
psql "$TEST_DATABASE_URL" -f apps/backend/supabase/migrations/20260818220000_cancellation_policy.sql
```

Do not run `supabase db push` against remote unless the human asks.

---

### Task 3: Apply cancel service + wire endpoints

**Files:**
- Create: `apps/backend/src/features/cancellations/gateway.ts`
- Create: `apps/backend/src/features/cancellations/notifications.ts`
- Create: `apps/backend/src/features/cancellations/service.ts`
- Test: `apps/backend/src/features/cancellations/service.test.ts`
- Modify: `trips/service.ts` `VALID_TRANSITIONS.waiting` → `['in_trip', 'cancelled']`; delete the `cancelled_early`/`cancelled_late` remap and `cancelled_late` compensation block (lines 114–158)
- Modify: `trips/service.ts` `acceptTrip` / `claimTrip` / `respondToTrip` accept path: set `assigned_at: sql\`COALESCE(${trips.assigned_at}, now())\``
- Modify: `tripService.cancelTrip(user, tripId, reason: 'driver_cancel' | 'no_show' = 'driver_cancel')` → `cancellationService.cancelByDriver`
- Modify: `passengerTripService.cancelTrip` → `cancellationService.cancelByPassenger`
- Modify: `trips/routes.ts` + `trips/schema.ts` body `{ reason: t.Optional(t.Union([t.Literal('driver_cancel'), t.Literal('no_show')])) }`
- Modify: `trips.test.ts` tests 7 and 8
- Modify: `passenger-trips.test.ts` waiting-cancel test
- Modify: test `truncateTables` helpers to delete new tables first (FK order: log, payouts, metrics, blocks, debt, then existing)

**Interfaces:**
- Consumes: `evaluateCancel`, `DEFAULT_CANCELLATION_CONFIG`, `parseCancellationConfig`
- Produces:
  - `getCancellationConfig(): Promise<CancellationConfig>`
  - `previewCancel(trip, actor, reason): Promise<CancelDecision & { copy: string }>`
  - `cancelByPassenger(user: AuthUser, tripId: string)`
  - `cancelByDriver(user: AuthUser, tripId: string, reason: 'driver_cancel' | 'no_show')`
  - `expireSearchTimeouts(): Promise<number>`
  - `NoopGateway.chargeFee(): Promise<false>`
  - `COPY: { free, fee_phase1, fee_phase2 }`

- [ ] **Step 1: Write failing integration tests** in `service.test.ts` using the same `createApp(createTestAuthPlugin())` + `request` helper as `trips.test.ts`. Cover spec cases 1–10 (pending free, timeout via calling `expireSearchTimeouts` after backdating `created_at`, grace 119/121, waiting passenger fee, no-show early/late, driver cancel TVF flag, in_trip 409, duplicate fee).

Passenger cancel from waiting must return 200 (rewrite `passenger-trips.test.ts` that currently expects 400).

`trips.test.ts` test 7: cancel from waiting without waiting 300s with `reason: 'no_show'` → 400 `NO_SHOW_TOO_EARLY`.

`trips.test.ts` test 8: backdate `waiting_since` 10 min, `reason: 'no_show'` → 200, status `cancelled`, `cancelation_log.fee_applied = 600`, `counts_for_tvf = false`.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/backend && bun test src/features/cancellations/service.test.ts src/features/trips/trips.test.ts src/features/passenger-trips/passenger-trips.test.ts
```

- [ ] **Step 3: Implement `cancellationService`**

`getCancellationConfig`: select `platform_config` where `key like 'cancel.%'`, parse, 30s in-memory cache.

`applyCancel(tx, { trip, actor, reason, passengerUserId })`:
1. `decision = evaluateCancel(...)`.
2. If `!decision.canCancel` throw `AppError(message, http, decision.code)` — 400 for `NO_SHOW_TOO_EARLY`, 409 for `CANCEL_NOT_ALLOWED`.
3. Update trip `status='cancelled'`, `updated_at=now`.
4. `recordEvent`.
5. Insert `cancelation_log` (catch unique violation → `FEE_ALREADY_APPLIED` 409).
6. If `feeArs > 0` call `applyFee` (Task 4 can stub as debt increment; implement debt write here so tests 4–7 pass — see Task 4 for the full function).
7. Notify (Task 7 copies; call `sendPushToUser` + existing broadcasts).
8. Return updated trip + decision.

`cancelByPassenger`: lock trip by `passenger_id`, actor `passenger`, reason `user_cancel`. Keep existing driver FCM + `broadcastTripCancelled` + `broadcastToPassenger`.

`cancelByDriver`: lock via `getDriverId` + `driver_id`. If `reason === 'driver_cancel'` and status is `waiting` and wait elapsed, still honor explicit reason (driver must send `no_show` for compensation). Broadcast to passenger + **new** passenger push (today missing).

`expireSearchTimeouts`: select `pending`/`offered` where `created_at <= now - searchTimeoutS`, call apply with actor `system` reason `auto_timeout` per row. Return count.

Remove `transitionTrip` early/late remap entirely. `cancelTrip` must not call `transitionTrip(..., 'cancelled')` anymore.

- [ ] **Step 4: Run tests — expect PASS** (fee/debt assertions that need tables from Task 2).

---

### Task 4: Debt, payouts, request gate, next-trip attach

**Files:**
- Modify: `cancellations/service.ts` `applyFee`, `assertPassengerCanRequest`, `attachDebtOnCollect`
- Modify: `passengerTripService.requestTrip` — call `assertPassengerCanRequest` before insert; include `debt_warning` on the returned object when `2500 ≤ amount < 3000`
- Modify: `tripService.collectTrip` — after `is_collected=true`, if `trip.passenger_id` and debt > 0, zero the debt (`status='paid'`), set response fields `debt_applied_ars`, `total_due_ars = (trip.total_fare ?? 0) + debt_applied`
- Create: `GET /passenger/trips/debt` and `GET /passenger/trips/:id/cancel-preview` in `passenger-trips/routes.ts`
- Test: extend `service.test.ts` cases 11–14

**Interfaces:**
- Consumes: `PaymentGateway`, `userDebt`, `driverFeePayouts`
- Produces:
  - `assertPassengerCanRequest(userId: string): Promise<{ debtArs: number; warning: boolean }>`
  - `applyFee(tx, { passengerId, driverId, tripId, feeArs, phase })`
  - `getPassengerDebt(userId)`
  - `previewForPassenger(user, tripId)`

`applyFee` exactly as spec:

```
if feeArs == 0: return
if existing log fee already applied for another path: return
if phase == 2 && await gateway.chargeFee(...): insert payout status 'ready'; return
upsert user_debt += feeArs; status = amount >= 3000 ? 'blocked' : 'pending'
insert payout pending 600
if crossed 2500: notify
if amount >= 3000: notify block
```

`NoopGateway` always `false`. Inject gateway via `setPaymentGateway(g)` for tests (phase 2 success/fail).

`assertPassengerCanRequest`:
- debt ≥ 3000 → `AppError(..., 403, 'DEBT_BLOCKED')`
- active `cancel_rate_72h` → `403 PASSENGER_SUSPENDED`
- active `cancel_rate_review` → `403 PASSENGER_UNDER_REVIEW`

Preview copy (Spanish, spec):

- `free`: `Cancelación sin costo. ¿Confirmas?`
- `fee_phase1`: `Cancelación con multa de $600. Se agregarán $600 a tu próximo viaje. ¿Confirmas?`
- `fee_phase2`: `Cancelación con multa de $600. Se cobrarán $600 automáticamente. ¿Confirmas?`

- [ ] Write tests 11–14 first, run FAIL, implement, run PASS.

---

### Task 5: Search timeout tick + GPS accuracy

**Files:**
- Create: `apps/backend/src/features/cancellations/timers.ts` exporting `expireSearchTimeouts` (or re-export from service)
- Modify: `apps/backend/src/index.ts` — inside the existing `setInterval` 5s callback, also `cancellationService.expireSearchTimeouts()`
- Modify: `arrivedBody` add `gps_accuracy_m: t.Optional(t.Number())`
- Modify: `arrivedTrip(user, tripId, body: { lat, lng, gps_accuracy_m?: number })`:
  - if `gps_accuracy_m == null || gps_accuracy_m > config.gpsAccuracyMaxM` → `AppError(..., 400, 'GPS_ACCURACY')`
  - distance check uses `config.arrivalRadiusM / 1000` km instead of hardcoded `0.05`
  - on success send passenger push: `Tu conductor ha llegado al punto de encuentro. Tienes 5 minutos para subir.`

**Tests:** arrive accuracy 80 → 400; accuracy 30 + distance 40 m → 200 `waiting`. Search: insert pending with `created_at` 301s ago, call `expireSearchTimeouts`, expect `cancelled` + log `auto_timeout`.

---

### Task 6: Metrics, blocks, matching, offer visibility, TVF

**Files:**
- Create: `metrics.ts`, `blocks.ts`
- Modify: `matching.service.ts` `findNearbyDrivers` — left join active `user_blocks` where `subject_type='driver' AND kind='tvf_review' AND (ends_at is null OR ends_at > now)` and exclude those driver ids
- Modify: `matchAndBroadcast` payload: attach `passenger_cancel_visible`, `passenger_cancel_rate_pct`, `passenger_cancel_count_30d` via `getPassengerVisibility(passengerId)`
- Modify: `earnings/service.ts` TVF window = `tvfWindowDays` (30). Numerator completed+rated in window. Denominator += `cancelation_log.counts_for_tvf` plus leftover `cancelled_early` rows with no log (backfill). Update `earnings.test.ts`: 10-day-old trips now count; move the “no recent” fixture to 31 days; keep 0.5 TVF by inserting `cancelation_log` with `counts_for_tvf=true` instead of relying only on `cancelled_early` once logs exist
- Recalc passenger metrics after passenger `user_cancel` and after `requestTrip`
- Recalc TVF after `driver_cancel`, `no_show`, and `completed` (`transitionTrip` completed branch)

**Interfaces:**
- `recalcPassengerMetrics(userId): Promise<{ rateBp, requested, cancels }>`
- `recalcDriverTvf(driverId): Promise<{ rateBp, completed, tvfCancels }>`
- `applyPassengerRateActions(userId, snapshot)` — warn >30% (dedupe 24h via last block/notification time), 72h block >40% if `requested >= minTrips`, review flag >50%
- `applyDriverTvfActions(driverId, snapshot)` — warn <70%, `tvf_review` block <50% if denominator > 0
- `getPassengerVisibility(userId): { visible, ratePct, count }`
- `hasActiveBlock(subjectType, subjectId, kind): Promise<boolean>`

Passenger cancel rate counts only `actor='passenger' AND reason='user_cancel'`. Auto-timeout does not count.

- [ ] Tests 15–18 from the spec. Run FAIL / implement / PASS.

---

### Task 7: Notifications + admin ops

**Files:**
- `notifications.ts` — export `CANCELLATION_MESSAGES` with every spec string. Functions `notifyFeeApplied`, `notifyArrived`, `notifyNoShow`, `notifyDebt(amount, blocked)`, `notifyCancelRateWarning`, `notifyTvfWarning`, `notifyPassengerDriverCancelled`.
- Email via existing Resend helper (grep `resend` / `sendEmail` in `apps/backend/src`) for cancel-rate warning only. If no generic mail helper, push-only is acceptable; do not invent a new mail stack.
- `admin/routes.ts` (admin role, same `isAdmin` guard):
  - `POST /admin/cancellations/debt/:userId/clear`
  - `POST /admin/cancellations/blocks/:id/clear`
  - `POST /admin/cancellations/payouts/:id/paid`
  - `GET /admin/cancellations/config`
  - `PUT /admin/cancellations/config` body `{ key, value }` only allowing keys starting with `cancel.`

Tests: admin non-admin 403; clear debt zeros amount; PUT invalid key 400.

---

### Task 8: Passenger app

**Files:**
- `apps/mobile-passengers/src/api/passenger.ts` — add:

```ts
export async function getCancelPreview(rideId: string) {
  const { data } = await api.get(`/passenger/trips/${rideId}/cancel-preview`);
  return data as { can_cancel: boolean; fee_ars: number; copy: string; collection_phase: 1 | 2 };
}
export async function getPassengerDebt() {
  const { data } = await api.get('/passenger/trips/debt');
  return data as { amount_ars: number; status: string };
}
```

- `ConnectingDriverScreen`: `SEARCH_TIMEOUT_MS = 300_000`. On `cancelled` from realtime, if still on this screen show “No se encontró conductor” (do not silently bounce home on `auto_timeout` without message — set `timedOut=true`). Keep cancel button.
- `TripInProgressScreen`: show cancel for `accepted | en_route | waiting`. `handleCancel` fetches preview, `Alert.alert` with `preview.copy`, confirm → `cancelRide`. Hide on `in_trip`.
- Request ride error mapping: if `error.code === 'DEBT_BLOCKED'` / `PASSENGER_SUSPENDED` / `PASSENGER_UNDER_REVIEW` show `error.message`. If request response has `debt_warning`, Alert `Tienes $${amount} de deuda. Próximo viaje incluirá ese monto.`
- `TripHistoryScreen`: on cancelled rows add button “Contactar soporte” → navigate to existing Support screen.
- Register push token if driver app already has `POST /notifications/token` wiring — copy `apps/mobile/src/lib/notifications.ts` + register in the passenger `AppInitializer` equivalent. Skip if no passenger initializer exists; do not invent a new push stack.

Update existing Jest tests (`ConnectingDriver.test.tsx`, `TripInProgress.test.tsx`) for 300s timeout and waiting cancel visibility.

---

### Task 9: Driver app

**Files:**
- `IncomingRequestScreen`: if `trip.passenger_cancel_visible` render  
  `Este pasajero tiene un ${rate}% de cancelación en los últimos 30 días (${count} cancelaciones).`
- `WaitingPassengerScreen`: when `seconds === 0` show enabled `Button` “Cancelar por no-show”. On press `POST /trips/${id}/cancel` `{ reason: 'no_show' }`. Success Alert: `Has recibido $600 por concepto de cancelación. Lifty te transferirá $600.` then `clearTrip` + navigate Online.
- `NavigationScreen` `handleCancelTrip`: POST body `{ reason: 'driver_cancel' }`.

No cancel control on `TripInProgressScreen`.

---

### Task 10: Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
bun --filter @lifty/backend test
bun --filter @lifty/backend typecheck
bun run lint
```

Fix failures. Do not commit. Do not push. Do not open a PR.

---

## Self-review (coverage)

| Spec section | Task |
|---|---|
| Decision table / evaluate | 1 |
| Tables + assigned_at + config keys | 2, 1 |
| waiting→cancelled, stop early/late | 3 |
| Fee, debt, phase 1/2 gateway, one fee | 4 |
| Request gates 2500/3000 | 4 |
| Next-trip debt attach | 4 |
| Search 300s timer | 5 |
| Arrive button + accuracy | 5 |
| Passenger 30/40/50 + min 5 | 6 |
| TVF formula + 70/50 | 6 |
| Matching exclusion | 6 |
| Accept-screen visibility ≥5 | 6, 9 |
| Notifications + arrived push | 5, 7 |
| Admin ops API | 7 |
| Passenger/driver UI | 8, 9 |
| Ops escape at debt ≥3000 | 4, 7 |
