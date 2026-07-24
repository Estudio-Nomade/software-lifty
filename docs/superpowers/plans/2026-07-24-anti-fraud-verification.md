# Anti-fraud Verification Before Starting Trip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-digit verification code step between driver arrival and trip start, validated server-side.

**Architecture:** Backend generates a 4-digit code during trip acceptance, stores it in the `trips` table, and sends a push notification to the passenger. `POST /trips/:id/start` now requires `{ verification_code: string }` in the body and validates it before transitioning to `in_trip`. Mobile shows a verification modal with OTPInput before calling start. A dev-only passenger mock screen displays the code.

**Tech Stack:** Bun + Elysia + Drizzle ORM + PostgreSQL (backend), Expo SDK 56 + React Native (mobile)

## Global Constraints

- Follow existing code patterns (inline modal overlay for WaitingPassengerScreen, rate limit middleware pattern for routes)
- Use `theme.colors.*`, `theme.spacing.*` for all visual values in mobile
- Backend errors use `AppError` subclasses (e.g., `BadRequestError`)
- All database changes go through Drizzle schema + Supabase migration
- Use existing `OTPInput` component, `Button` component, `sendPushToUser` utility
- No production deployment — backend runs on localhost, mobile via Expo Go

---

### Task 1: DB — Add verification_code column to trips table

**Files:**
- Create: `apps/backend/supabase/migrations/YYYYMMDDHHMMSS_add_verification_code.sql`
- Modify: `apps/backend/src/shared/db/schema/trips.ts`

**Interfaces:**
- Consumes: none
- Produces: `trips.verification_code: char(4) | null` column in Drizzle schema and DB

- [ ] **Step 1: Generate migration SQL**

```bash
cd apps/backend && supabase migration new add_verification_code
```

Find the newly created file and add this SQL:

```sql
ALTER TABLE trips ADD COLUMN IF NOT EXISTS verification_code CHAR(4);
```

- [ ] **Step 2: Update Drizzle schema**

In `apps/backend/src/shared/db/schema/trips.ts`, add the `char` import (already imported from `drizzle-orm/pg-core` hook — no change needed since `char` is from `drizzle-orm/pg-core` which is already imported) and add the column after `waiting_since`:

```ts
import {
  boolean,
  char,           // ← add this
  doublePrecision,
  integer,
  pgTable,
  real,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
```

Then add the column to the trips table definition, after `waiting_since`:

```ts
export const trips = pgTable('trips', {
  // ... existing columns ...
  waiting_since: timestamp('waiting_since'),
  verification_code: char('verification_code', { length: 4 }),   // ← add this
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
```

- [ ] **Step 3: Apply migration to Supabase remote**

```bash
cd apps/backend && supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/supabase/migrations/*.sql apps/backend/src/shared/db/schema/trips.ts
git commit -m "feat: add verification_code column to trips table"
```

---

### Task 2: Backend — Add verification_code to trip schema (Elysia body validation)

**Files:**
- Modify: `apps/backend/src/features/trips/schema.ts` — add `startTripBody`
- Modify: `apps/backend/src/features/trips/routes.ts` — use body schema + rate limit on start

**Interfaces:**
- Consumes: `trips.verification_code` column (Task 1)
- Produces: `startTripBody` schema `{ verification_code: t.String() }`, rate-limited `POST /trips/:id/start`

- [ ] **Step 5: Add startTripBody schema**

In `apps/backend/src/features/trips/schema.ts`, add:

```ts
export const startTripBody = t.Object({
  verification_code: t.String({ minLength: 4, maxLength: 4 }),
});
```

- [ ] **Step 6: Add rate limit + body to start route**

In `apps/backend/src/features/trips/routes.ts`, add a `startRateLimit` and update the `/:id/start` route. First, import `startTripBody`:

```ts
import { collectBody, createTripBody, startTripBody, tripIdParams } from './schema';
```

Then add the rate limit after the `completeRateLimit` definition:

```ts
const startRateLimit = rateLimit({
  name: 'rate-limit-trip-start',
  keyPrefix: 'ratelimit:trip:start:ip',
  max: Number(process.env.TRIP_START_RATE_LIMIT_MAX) || 10,
  windowMs: Number(process.env.TRIP_RATE_LIMIT_WINDOW_MS) || 60_000,
}).as('scoped');
```

Add a scoped route group for start (following same pattern as acceptRoute):

```ts
const startRoute = new Elysia()
  .use(startRateLimit)
  .post(
    '/:id/start',
    ({ user, params, body, set }) => safeCall(() => tripService.startTrip(user, params.id, body.verification_code), set),
    { params: tripIdParams, body: startTripBody, requireAuth: true },
  );
```

Replace the existing `.post('/:id/start', ...)` in the `tripRoutes` definition with `.use(startRoute)`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/features/trips/schema.ts apps/backend/src/features/trips/routes.ts
git commit -m "feat: add verification_code body validation and rate limit to trip start"
```

---

### Task 3: Backend — Generate verification_code in acceptTrip + validate in startTrip

**Files:**
- Modify: `apps/backend/src/features/trips/service.ts`

**Interfaces:**
- Consumes: `trips.verification_code` column (Task 1), `startTripBody` (Task 2), `sendPushToUser` (existing)
- Produces: `acceptTrip` generates and stores code + sends push; `startTrip(verification_code)` validates

- [ ] **Step 8: Update acceptTrip to generate verification code**

In `apps/backend/src/features/trips/service.ts`, replace `acceptTrip` (lines 193-196):

```ts
async acceptTrip(user: AuthUser, tripId: string) {
  const driverId = await getDriverId(user);
  const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

  return db.transaction(async (tx) => {
    const trip = await findTrip(driverId, tripId, tx);

    const allowed = VALID_TRANSITIONS[trip.status];
    if (!allowed || !allowed.includes('accepted')) {
      throw new AppError(
        `Invalid transition from ${trip.status} to accepted`,
        400,
        'BAD_REQUEST',
      );
    }

    await tx.update(trips).set({
      status: 'accepted',
      verification_code: verificationCode,
      updated_at: new Date(),
    }).where(eq(trips.id, tripId));

    await recordEvent(tripId, trip.status, 'accepted', tx);

    const [updated] = await tx.select().from(trips).where(eq(trips.id, tripId));

    if (trip.passenger_id) {
      sendPushToUser(trip.passenger_id, {
        title: 'Tu conductor aceptó el viaje',
        body: `Código de verificación: ${verificationCode}`,
        data: { type: 'trip:verification', trip_id: tripId, verification_code: verificationCode },
      });
    }

    return updated;
  });
},
```

Note: `acceptTrip` no longer calls `transitionTrip` directly — it does its own transaction because it needs to set `verification_code` and send push. This follows the same pattern as `createTrip` which also manages its own transaction.

Add the missing `trips` import for the `eq` usage — `eq` is already imported from `drizzle-orm` at line 1.

- [ ] **Step 9: Update startTrip to validate verification code**

Replace `startTrip` (lines 213-216):

```ts
async startTrip(user: AuthUser, tripId: string, verificationCode: string) {
  const driverId = await getDriverId(user);

  const trip = await db
    .select({ verification_code: trips.verification_code })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
    .limit(1);

  if (!trip[0]) throw new NotFoundError('Trip not found');
  if (trip[0].verification_code !== verificationCode) {
    throw new BadRequestError('El código de verificación no coincide');
  }

  return transitionTrip(driverId, tripId, 'in_trip');
},
```

Need to import `BadRequestError`. Update the import on line 5:

```ts
import { AppError, BadRequestError, NotFoundError } from '../../shared/lib/errors';
```

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/features/trips/service.ts
git commit -m "feat: generate verification code on accept, validate on start"
```

---

### Task 4: Backend — Write tests for verification code flow

**Files:**
- Modify: `apps/backend/src/features/trips/trips.test.ts`

**Interfaces:**
- Consumes: `acceptTrip` generates code (Task 3), `startTrip` validates (Task 3)
- Produces: 4 new test cases

- [ ] **Step 11: Add test — acceptTrip generates 4-digit verification_code**

Find the existing test block for test 2 (accept) — around lines 155-178. After that test, insert:

```ts
test('2b. accept generates 4-digit verification_code', async () => {
  const token = await registerAndGetToken(phone, password);
  await createDriverRow(token);

  const { data: trip } = await request(
    'POST',
    '/api/trips',
    { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
    token,
  );

  const { status, data } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

  expect(status).toBe(200);
  expect(data.verification_code).toMatch(/^\d{4}$/);

  const db = getDb();
  const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
  expect(updated!.verification_code).toMatch(/^\d{4}$/);
  expect(updated!.verification_code).toBe(data.verification_code);
});
```

- [ ] **Step 12: Add test — startTrip with correct verification_code succeeds**

Find the existing test 5 (lines 200-225). Replace it with:

```ts
test('5. start with correct verification_code → in_trip', async () => {
  const token = await registerAndGetToken(phone, password);
  await createDriverRow(token);

  const { data: trip } = await request(
    'POST',
    '/api/trips',
    { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
    token,
  );

  const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
  const code = accepted.verification_code;

  await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

  const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, { verification_code: code }, token);

  expect(status).toBe(200);
  expect(data.status).toBe('in_trip');

  const db = getDb();
  const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
  expect(events.length).toBe(5);
  expect(events[4].from_status).toBe('waiting');
  expect(events[4].to_status).toBe('in_trip');
});
```

- [ ] **Step 13: Add test — startTrip with wrong verification_code fails**

After the test above, add:

```ts
test('5b. start with wrong verification_code fails', async () => {
  const token = await registerAndGetToken(phone, password);
  await createDriverRow(token);

  const { data: trip } = await request(
    'POST',
    '/api/trips',
    { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
    token,
  );

  const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
  expect(accepted.verification_code).toBeTruthy();

  await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

  const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, { verification_code: '9999' }, token);

  expect(status).toBe(400);
  expect(data.error.message).toMatch(/verificación/);
});
```

- [ ] **Step 14: Add test — startTrip without verification_code returns validation error**

After the test above, add:

```ts
test('5c. start without verification_code returns validation error', async () => {
  const token = await registerAndGetToken(phone, password);
  await createDriverRow(token);

  const { data: trip } = await request(
    'POST',
    '/api/trips',
    { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
    token,
  );

  await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

  const res = await app.handle(new Request(`http://localhost/api/trips/${trip.id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  }));

  expect(res.status).toBe(422);
});
```

- [ ] **Step 15: Run backend tests to verify**

```bash
cd apps/backend && bun test src/features/trips/trips.test.ts
```

Expected: all trip tests pass, including the 4 new ones.

- [ ] **Step 16: Commit**

```bash
git add apps/backend/src/features/trips/trips.test.ts
git commit -m "test: verify verification_code generation and validation"
```

---

### Task 5: Mobile — Add verification_code to Trip type

**Files:**
- Modify: `apps/mobile/src/api/types.ts`

**Interfaces:**
- Consumes: backend now returns `verification_code` in trip responses (Task 3)
- Produces: `Trip` type with `verification_code: string | null`

- [ ] **Step 17: Add verification_code to tripSchema**

In `apps/mobile/src/api/types.ts`, add to the `tripSchema` object (after `passenger_rating`):

```ts
export const tripSchema = z.object({
  id: z.string(),
  driver_id: z.string(),
  passenger_id: z.string().nullable(),
  status: tripStatusSchema,
  origin_address: z.string().nullable(),
  origin_lat: z.number(),
  origin_lng: z.number(),
  dest_address: z.string().nullable(),
  dest_lat: z.number(),
  dest_lng: z.number(),
  distance_km: z.number().nullable(),
  duration_minutes: z.number().nullable(),
  base_fare: z.number().nullable(),
  distance_fare: z.number().nullable(),
  time_fare: z.number().nullable(),
  total_fare: z.number().nullable(),
  platform_fee: z.number().nullable(),
  driver_earnings: z.number().nullable(),
  payment_method: z.string().nullable(),
  is_collected: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  passenger_name: z.string().nullable(),
  passenger_avatar_url: z.string().nullable(),
  passenger_phone: z.string().nullable(),
  passenger_rating: z.number().nullable(),
  verification_code: z.string().length(4).nullable(),   // ← add this
});
```

- [ ] **Step 18: Commit**

```bash
git add apps/mobile/src/api/types.ts
git commit -m "feat: add verification_code to Trip type"
```

---

### Task 6: Mobile — Verification modal in WaitingPassengerScreen

**Files:**
- Modify: `apps/mobile/src/screens/WaitingPassengerScreen.tsx`

**Interfaces:**
- Consumes: `OTPInput` component, `Button` component, `Trip.verification_code` type (Task 5), `apiClient` (existing)
- Produces: verification modal that appears on "INICIAR VIAJE" press, validates code via `POST /trips/:id/start`

- [ ] **Step 19: Add verification modal state and handler**

In `apps/mobile/src/screens/WaitingPassengerScreen.tsx`, add imports:

```ts
import { OTPInput } from '../components/OTPInput';
```

Add new state variables after existing state declarations (after line 32):

```ts
const [showVerificationModal, setShowVerificationModal] = useState(false);
const [verificationCode, setVerificationCode] = useState('');
const [verificationError, setVerificationError] = useState('');
const [verifying, setVerifying] = useState(false);
```

- [ ] **Step 20: Modify handleStartTrip to open modal instead of calling API directly**

Replace `handleStartTrip` (lines 86-98) with:

```ts
const handleStartTripPress = () => {
  setVerificationCode('');
  setVerificationError('');
  setShowVerificationModal(true);
};

const handleVerifyAndStart = async () => {
  if (!activeTripId || verificationCode.length !== 4) return;
  setVerifying(true);
  setVerificationError('');
  try {
    await apiClient.post(`/trips/${activeTripId}/start`, { verification_code: verificationCode });
    setShowVerificationModal(false);
    setTripStatus('in_trip');
    navigation.navigate('TripInProgress');
  } catch (err: any) {
    const message = err?.response?.data?.error?.message ?? 'No se pudo iniciar el viaje.';
    setVerificationError(message);
  } finally {
    setVerifying(false);
  }
};
```

- [ ] **Step 21: Update the "INICIAR VIAJE" button to trigger modal**

Change line 186 from `onPress={handleStartTrip}` to `onPress={handleStartTripPress}`.

- [ ] **Step 22: Add verification modal JSX**

Add the verification modal between the cancel modal (after line 141, before `<View style={styles.spacer} />`):

```tsx
{showVerificationModal && (
  <View style={styles.modalOverlay}>
    <View style={styles.modal}>
      <Text style={styles.modalTitle}>Código de verificación</Text>
      <Text style={styles.modalText}>
        Pedile al pasajero el código de 4 dígitos
      </Text>
      <OTPInput
        length={4}
        value={verificationCode}
        onChange={(val) => {
          setVerificationCode(val);
          if (verificationError) setVerificationError('');
        }}
      />
      {verificationError ? (
        <Text style={styles.verificationError}>{verificationError}</Text>
      ) : null}
      <Button
        title="CONFIRMAR"
        variant="cta"
        onPress={handleVerifyAndStart}
        loading={verifying}
        disabled={verificationCode.length !== 4}
        style={styles.modalButton}
      />
      <Button
        title="CANCELAR"
        onPress={() => setShowVerificationModal(false)}
        style={styles.modalButton}
      />
    </View>
  </View>
)}
```

- [ ] **Step 23: Add verificationError style**

Add to the `StyleSheet.create` block:

```ts
verificationError: {
  fontSize: theme.fontSize.sm,
  color: theme.colors.dangerRed,
  textAlign: 'center',
},
```

- [ ] **Step 24: Add dev-only "Ver código pasajero" button**

Add a floating button before the spacer `</View>` (before line 142), only visible in dev:

```tsx
{__DEV__ && (
  <TouchableOpacity
    style={styles.devButton}
    onPress={() => navigation.navigate('PassengerCode')}
  >
    <Text style={styles.devButtonText}>Ver código pasajero</Text>
  </TouchableOpacity>
)}
```

Add styles:

```ts
devButton: {
  position: 'absolute',
  top: 50,
  right: 16,
  backgroundColor: theme.colors.turquoise,
  paddingHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.sm,
  borderRadius: theme.radius.md,
  zIndex: 5,
},
devButtonText: {
  fontSize: theme.fontSize.xs,
  fontWeight: theme.fontWeight.bold,
  color: theme.colors.white,
},
```

- [ ] **Step 25: Run typecheck**

```bash
cd apps/mobile && bunx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 26: Commit**

```bash
git add apps/mobile/src/screens/WaitingPassengerScreen.tsx
git commit -m "feat: add verification code modal before starting trip"
```

---

### Task 7: Mobile — PassengerCodeScreen (dev mock)

**Files:**
- Create: `apps/mobile/src/screens/PassengerCodeScreen.tsx`
- Create: `apps/mobile/app/passenger-code.tsx`
- Modify: `apps/mobile/src/hooks/useAppNavigation.ts`

**Interfaces:**
- Consumes: `Trip.verification_code` from `useTripStore` (Task 5), `theme` (existing)
- Produces: `/passenger-code` route showing the verification code in large text

- [ ] **Step 27: Create PassengerCodeScreen**

Create `apps/mobile/src/screens/PassengerCodeScreen.tsx`:

```tsx
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

export const PassengerCodeScreen: React.FC = () => {
  const trip = useTripStore((s) => s.trip);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Tu código de verificación</Text>
      <View style={styles.codeBox}>
        <Text style={styles.code}>{trip?.verification_code ?? '----'}</Text>
      </View>
      <Text style={styles.hint}>Mostrale este código a tu conductor</Text>
      {trip?.passenger_name ? (
        <Text style={styles.driver}>Conductor: {trip.passenger_name}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
  },
  label: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  codeBox: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.lg,
  },
  code: {
    fontSize: theme.fontSize['5xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: 8,
  },
  hint: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  driver: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
});
```

- [ ] **Step 28: Create route file**

Create `apps/mobile/app/passenger-code.tsx`:

```tsx
export { PassengerCodeScreen as default } from '../src/screens/PassengerCodeScreen';
```

- [ ] **Step 29: Add to navigation**

In `apps/mobile/src/hooks/useAppNavigation.ts`, add to `SCREEN_TO_ROUTE`:

```ts
PassengerCode: '/passenger-code',
```

- [ ] **Step 30: Run typecheck**

```bash
cd apps/mobile && bunx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 31: Commit**

```bash
git add apps/mobile/src/screens/PassengerCodeScreen.tsx apps/mobile/app/passenger-code.tsx apps/mobile/src/hooks/useAppNavigation.ts
git commit -m "feat: add passenger verification code dev screen"
```

---

### Task 8: Final verification — full lint + typecheck + test

**Files:**
- None

- [ ] **Step 32: Run typecheck on both projects**

```bash
bun run typecheck
```

Fix any type errors.

- [ ] **Step 33: Run lint**

```bash
bun run lint
```

Fix any lint errors.

- [ ] **Step 34: Run backend tests**

```bash
cd apps/backend && bun test
```

All tests must pass.

- [ ] **Step 35: Commit any fixes**

If lint/typecheck/test required fixes:

```bash
git add -A && git commit -m "chore: fix lint and type errors"
```

---

