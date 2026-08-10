# Phase-Based Driver Commission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded 20% commission and driver-level exemption with a global phase/month-based commission system configurable by admin.

**Architecture:** New `commission_phases` table defines phase rules (fixed or incremental rates by month range). New `commission.ts` lib calculates the current rate from a `commission_start_date` platform config. The fare calculation layer consumes this dynamically instead of the old `commission_exempt_until` + default 0.2 pattern. Admin API exposes CRUD for phases and start date.

**Tech Stack:** Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase), Expo SDK 56 + React Native

## Global Constraints

- Commission rate range: 0.00–1.00 (0%–100%)
- Crecimiento phase cap: 15% (0.15)
- Month counter: `differenceInCalendarMonths(now, start_date) + 1`
- `commission_start_date` must be configured (YYYY-MM-DD format)
- Admin auth: `user.role === 'admin'` (existing pattern)
- Remove `drivers.commission_exempt_until` column and all references
- Keep "Sin comision!" badge in mobile — shows when rate = 0%

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0031_commission_phases.sql`
- Create: `apps/backend/src/shared/db/schema/commission-phases.ts`
- Create: `apps/backend/src/shared/db/schema/platform-config.ts`
- Modify: `apps/backend/src/shared/db/schema/index.ts`
- Modify: `apps/backend/src/shared/db/schema/drivers.ts`

**Interfaces:**
- Produces: `commissionPhases` and `platformConfig` Drizzle table objects, exported from schema index. `drivers` table without `commission_exempt_until`.

- [ ] **Step 1: Create migration SQL**

```sql
-- supabase/migrations/0031_commission_phases.sql

CREATE TABLE IF NOT EXISTS commission_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  month_start INTEGER NOT NULL,
  month_end INTEGER,
  base_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  monthly_increment DOUBLE PRECISION,
  cap_rate DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO commission_phases (name, month_start, month_end, base_rate, monthly_increment, cap_rate)
VALUES
  ('Lanzamiento', 1, 1, 0.00, NULL, NULL),
  ('Medición', 2, 2, 0.05, NULL, NULL),
  ('Estabilización', 3, 6, 0.10, NULL, NULL),
  ('Crecimiento', 7, NULL, 0.10, 0.007, 0.15);

ALTER TABLE drivers DROP COLUMN IF EXISTS commission_exempt_until;
```

- [ ] **Step 2: Verify migration SQL is valid**

Run: `supabase migration list`
Expected: migration 0031 shows as pending.

- [ ] **Step 3: Create Drizzle schema for commission_phases**

```typescript
// apps/backend/src/shared/db/schema/commission-phases.ts
import { doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const commissionPhases = pgTable('commission_phases', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  month_start: integer('month_start').notNull(),
  month_end: integer('month_end'),
  base_rate: doublePrecision('base_rate').notNull().default(0),
  monthly_increment: doublePrecision('monthly_increment'),
  cap_rate: doublePrecision('cap_rate'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 4: Create Drizzle schema for platform_config**

```typescript
// apps/backend/src/shared/db/schema/platform-config.ts
import { pgTable, timestamp, uuid, varchar, text } from 'drizzle-orm/pg-core';

export const platformConfig = pgTable('platform_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).unique().notNull(),
  value: text('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 5: Export new tables from schema index**

Read `apps/backend/src/shared/db/schema/index.ts`, then apply:

```typescript
// Add at end of apps/backend/src/shared/db/schema/index.ts
export { commissionPhases } from './commission-phases';
export { platformConfig } from './platform-config';
```

- [ ] **Step 6: Remove commission_exempt_until from drivers schema**

Read `apps/backend/src/shared/db/schema/drivers.ts` and remove line 37:
```typescript
  commission_exempt_until: timestamp('commission_exempt_until'),
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0031_commission_phases.sql apps/backend/src/shared/db/schema/
git commit -m "feat: add commission_phases and platform_config tables, drop commission_exempt_until"
```

---

### Task 2: Commission Rate Library

**Files:**
- Create: `apps/backend/src/shared/lib/commission.ts`

**Interfaces:**
- Consumes: `commissionPhases` table, `platformConfig` table from Task 1
- Produces: `getCommissionRate()` → `Promise<number>`, `getCommissionConfig()` → `Promise<ConfigResult>`

- [ ] **Step 1: Write the test file**

```typescript
// apps/backend/src/shared/lib/commission.test.ts
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../db/client';
import { commissionPhases, platformConfig } from '../db/schema';
import { getCommissionRate, getCommissionConfig } from './commission';

beforeEach(async () => {
  const db = getDb();
  await db.delete(commissionPhases);
  await db.delete(platformConfig);

  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.00 },
    { name: 'Medición', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilización', month_start: 3, month_end: 6, base_rate: 0.10 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.10, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
});

afterAll(() => {
  resetDb();
});

describe('getCommissionRate', () => {
  test('throws if start_date not configured', async () => {
    const db = getDb();
    await expect(getCommissionRate(db)).rejects.toThrow('commission_start_date not configured');
  });

  test('returns 0% for month 1 (Lanzamiento)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-10-15'));
    expect(rate).toBe(0);
  });

  test('returns 5% for month 2 (Medición)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-11-10'));
    expect(rate).toBe(0.05);
  });

  test('returns 10% for month 3 (Estabilización)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2026-12-05'));
    expect(rate).toBe(0.10);
  });

  test('returns 10% for month 7 day 1 (Crecimiento base)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2027-04-01'));
    expect(rate).toBe(0.10);
  });

  test('returns 10.7% for month 8 (Crecimiento +1 increment)', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2027-05-01'));
    expect(rate).toBeCloseTo(0.107, 3);
  });

  test('caps at 15% for month 20', async () => {
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-10-01' });
    const rate = await getCommissionRate(db, new Date('2028-05-01'));
    expect(rate).toBe(0.15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun test src/shared/lib/commission.test.ts`
Expected: FAIL — `getCommissionRate` is not defined.

- [ ] **Step 3: Implement the commission library**

```typescript
// apps/backend/src/shared/lib/commission.ts
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { commissionPhases, platformConfig } from '../db/schema';

export interface CommissionConfig {
  phase: string | null;
  currentMonth: number;
  rate: number;
}

export async function getConfig(db: NodePgDatabase, key: string): Promise<string> {
  const [row] = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, key))
    .limit(1);
  return row?.value ?? '';
}

export async function setConfig(db: NodePgDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(platformConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformConfig.key, set: { value, updated_at: new Date() } });
}

export async function getCommissionRate(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<number> {
  const config = await getCommissionConfig(db, now);
  return config.rate;
}

export async function getCommissionConfig(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<CommissionConfig> {
  const dateStr = await getConfig(db, 'commission_start_date');
  if (!dateStr) {
    throw new Error('commission_start_date not configured');
  }

  const startDate = new Date(dateStr + 'T00:00:00Z');
  const currentMonth = differenceInCalendarMonths(now, startDate) + 1;

  const [phase] = await db
    .select()
    .from(commissionPhases)
    .where(
      and(
        lte(commissionPhases.month_start, currentMonth),
        sql`(${commissionPhases.month_end} IS NULL OR ${commissionPhases.month_end} >= ${currentMonth})`,
      ),
    )
    .limit(1);

  if (!phase) {
    throw new Error(`No commission phase found for month ${currentMonth}`);
  }

  let rate = phase.base_rate;

  if (phase.monthly_increment != null) {
    const extraMonths = currentMonth - phase.month_start;
    rate = phase.base_rate + extraMonths * phase.monthly_increment;
    if (phase.cap_rate != null) {
      rate = Math.min(rate, phase.cap_rate);
    }
  }

  return { phase: phase.name, currentMonth, rate };
}

function differenceInCalendarMonths(a: Date, b: Date): number {
  return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun test src/shared/lib/commission.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Run all tests to confirm no regressions**

Run: `cd apps/backend && bun test`
Expected: all tests pass (some may fail from `commission_exempt_until` references — those are fixed in later tasks).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/shared/lib/commission.ts apps/backend/src/shared/lib/commission.test.ts
git commit -m "feat: add commission rate library with phase/month calculation"
```

---

### Task 3: Update Fare Calculation Layer

**Files:**
- Modify: `apps/backend/src/shared/lib/pricing.ts`
- Modify: `apps/backend/src/shared/lib/fuel-pricing.ts`

**Interfaces:**
- Consumes: `getCommissionRate()` from Task 2
- Produces: unchanged (`calculateFare()`, `calculatePlatformFee()`), but default rate is now dynamic via `getCommissionRate()`.

- [ ] **Step 1: Update pricing.ts**

Read `apps/backend/src/shared/lib/pricing.ts` and apply changes:

In `calculateFare()` (line 53), replace:
```typescript
  const commissionRate = input.commission_rate ?? 0.2;
```
With:
```typescript
  const commissionRate = input.commission_rate ?? 0.2; // caller passes explicit rate or uses default
```

In `calculatePlatformFee()` (line 36), change the signature to accept 0.2 as default so tests/explicit callers keep working:
```typescript
// Keep as-is for backward compat — callers now pass explicit rate from getCommissionRate()
export function calculatePlatformFee(total: number, commissionRate = 0.2): number {
```

Remove the `0.2` default from the `FareInput` commission_rate description by changing line 24 from:
```typescript
  commission_rate?: number;
```
To:
```typescript
  commission_rate?: number; // 0.2 default when not provided (used by tests / explicit callers)
```

The function signature and default don't change; the caller (trip service) will now pass the dynamic rate explicitly.

- [ ] **Step 2: Update fuel-pricing.ts**

Read `apps/backend/src/shared/lib/fuel-pricing.ts`. Change line 261:

```typescript
const commissionRate = input.commission_rate ?? 0.2;
```
To:
```typescript
const commissionRate = input.commission_rate ?? 0.2; // dynamic rate passed by caller
```

- [ ] **Step 3: Run pricing tests to confirm no breakage**

Run: `cd apps/backend && bun test --test-name-pattern="pricing|fuel"`
Expected: all pricing & fuel-pricing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/lib/pricing.ts apps/backend/src/shared/lib/fuel-pricing.ts
git commit -m "refactor: prepare fare layer for dynamic commission rate"
```

---

### Task 4: Clean Up Trip Service

**Files:**
- Modify: `apps/backend/src/features/trips/service.ts`

**Interfaces:**
- Consumes: `getCommissionRate()` from Task 2, `db` from client, `drivers` schema (no `commission_exempt_until`)
- Removes: `commission_exempt_until` query in `createPendingTrip()`, `createTrip()`, and `cancelTrip()` late-cancellation path.

- [ ] **Step 1: Remove exempt check from createPendingTrip (lines 179-194)**

Read `apps/backend/src/features/trips/service.ts` around lines 164-194.

Replace:
```typescript
  async createPendingTrip(data: {
    ...
  }) {
    const [driverRecord] = await db
      .select({ commission_exempt_until: drivers.commission_exempt_until })
      .from(drivers)
      .where(eq(drivers.id, data.driver_id))
      .limit(1);

    const isExempt =
      driverRecord?.commission_exempt_until != null &&
      new Date(driverRecord.commission_exempt_until) > new Date();

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
      commission_rate: isExempt ? 0 : undefined,
    });
```

With:
```typescript
  async createPendingTrip(data: {
    ...
  }) {
    const commissionRate = await getCommissionRate(/* db */);

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
      commission_rate: commissionRate,
    });
```

Note: need to import `getCommissionRate` from `../../shared/lib/commission` and `getDb` from `../../shared/db/client` (or use the `db` proxy). Since `getCommissionRate` takes a `NodePgDatabase` instance, use:

```typescript
import { getCommissionRate } from '../../shared/lib/commission';
import { getDb } from '../../shared/db/client';
```

- [ ] **Step 2: Remove exempt check from createTrip (lines 403-420)**

Replace:
```typescript
    const [driverRecord] = await db
      .select({ commission_exempt_until: drivers.commission_exempt_until })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    const isExempt =
      driverRecord?.commission_exempt_until != null &&
      new Date(driverRecord.commission_exempt_until) > new Date();

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
      commission_rate: isExempt ? 0 : undefined,
    });
```

With:
```typescript
    const commissionRate = await getCommissionRate(getDb());

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
      commission_rate: commissionRate,
    });
```

- [ ] **Step 3: Remove exempt check from cancelTrip late-cancellation (lines 119-135)**

Replace:
```typescript
    const [driverRecord] = await tx
      .select({ commission_exempt_until: drivers.commission_exempt_until })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    const isExempt =
      driverRecord?.commission_exempt_until != null &&
      new Date(driverRecord.commission_exempt_until) > new Date();

    const cancellationFee = await calculateFare({
      vehicle_type: trip.vehicle_type,
      distance_km: 0,
      duration_minutes: 0,
      commission_rate: isExempt ? 0 : undefined,
    });
```

With:
```typescript
    const commissionRate = await getCommissionRate(tx as any);

    const cancellationFee = await calculateFare({
      vehicle_type: trip.vehicle_type,
      distance_km: 0,
      duration_minutes: 0,
      commission_rate: commissionRate,
    });
```

When replacing this, note that the code runs inside a transaction (`tx`). `getCommissionRate` uses `db.select`, but inside a transaction the `tx` object is a Drizzle transaction, not a `NodePgDatabase`. Since the transaction is already committed at this point and the trip table update happens later, we can call `getCommissionRate` BEFORE the transaction, then pass the rate into the transaction closure.

Actually, looking at the code more carefully — the cancelTrip function (around lines 100-162) has a transaction. The late-cancel check is inside the transaction. The simplest approach: compute `commissionRate` before the transaction starts, and use it inside. Let me check the full cancelTrip structure.

Look at the flow: The function starts with querying the trip, then enters a transaction `db.transaction(async (tx) => {...})`. Inside the transaction, the exempt check + fare calculation happen. We should move the `getCommissionRate()` call BEFORE `db.transaction(...)` and capture it in a variable used inside the closure.

Let me look at the exact code structure.

- [ ] **Step 4: Verify cancelTrip structure**

Read lines 100-162 of `apps/backend/src/features/trips/service.ts`. The late-cancel block starts at ~line 119. The fix: move `const commissionRate = await getCommissionRate(getDb());` to just before `db.transaction(...)`, and replace the exemption logic inside with just `commission_rate: commissionRate`.

- [ ] **Step 5: Run trip tests**

Run: `cd apps/backend && bun test src/features/trips/`
Expected: tests may fail if they reference `commission_exempt_until` (those are fixed in Task 8).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/trips/service.ts
git commit -m "refactor: replace commission_exempt_until with dynamic getCommissionRate in trip service"
```

---

### Task 5: Clean Up Driver Service

**Files:**
- Modify: `apps/backend/src/features/drivers/service.ts`

**Interfaces:**
- Removes: `commission_exempt_until` insertion logic in `updateProfile()`.

- [ ] **Step 1: Remove exempt logic from driver creation**

Read `apps/backend/src/features/drivers/service.ts` lines 275-288. Replace:

```typescript
      const [driverCount] = await db.select({ count: count() }).from(drivers);

      const isFirstTen = driverCount && driverCount.count < 10;
      const commissionExemptUntil = isFirstTen
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

      const [newDriver] = await db
        .insert(drivers)
        .values({
          user_id: user.id,
          status: 'step1',
          commission_exempt_until: commissionExemptUntil,
        })
        .returning({ id: drivers.id });
```

With:
```typescript
      const [newDriver] = await db
        .insert(drivers)
        .values({
          user_id: user.id,
          status: 'step1',
        })
        .returning({ id: drivers.id });
```

Also remove `count` from the drizzle import if it's no longer used (check line 1: `import { and, count, eq, ne } from 'drizzle-orm';`). If `count` is used elsewhere, keep it.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/features/drivers/service.ts
git commit -m "refactor: remove commission_exempt_until from driver creation"
```

---

### Task 6: Update Earnings Service

**Files:**
- Modify: `apps/backend/src/features/earnings/service.ts`

**Interfaces:**
- Removes: `commission_exempt_until` from daily earnings query and response.

- [ ] **Step 1: Remove exempt from getDaily**

In `apps/backend/src/features/earnings/service.ts`, lines 19-26, change:

```typescript
    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
        commission_exempt_until: drivers.commission_exempt_until,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
```

To:
```typescript
    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
```

- [ ] **Step 2: Remove exempt from return value**

Line 81, change:
```typescript
      commission_exempt_until: driver?.commission_exempt_until ?? null,
```
To: (remove the line entirely, so the closing brace at line 82 is clean)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/earnings/service.ts
git commit -m "refactor: remove commission_exempt_until from earnings service"
```

---

### Task 7: Admin API — Commission Endpoints

**Files:**
- Modify: `apps/backend/src/features/admin/routes.ts`
- Modify: `apps/backend/src/features/admin/schema.ts`
- Modify: `apps/backend/src/features/admin/service.ts`

**Interfaces:**
- Consumes: `commissionPhases`, `platformConfig` from Task 1; `getCommissionConfig`, `getCommissionRate`, `getConfig`, `setConfig` from Task 2
- Produces: 5 new admin endpoints for commission management

- [ ] **Step 1: Add validation schemas**

Read `apps/backend/src/features/admin/schema.ts` and append:

```typescript
import { t } from 'elysia';

export const updatePhaseSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  month_start: t.Optional(t.Number({ minimum: 1 })),
  month_end: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
  base_rate: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  monthly_increment: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
  cap_rate: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
});

export const updateStartDateSchema = t.Object({
  value: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
});
```

- [ ] **Step 2: Add commission service methods**

Read `apps/backend/src/features/admin/service.ts` and append inside `adminService`:

```typescript
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { commissionPhases, platformConfig } from '../../shared/db/schema';
import { getCommissionConfig } from '../../shared/lib/commission';

  async listCommissionPhases() {
    return db
      .select()
      .from(commissionPhases)
      .orderBy(commissionPhases.month_start);
  },

  async updateCommissionPhase(id: string, data: Record<string, any>) {
    const [existing] = await db
      .select()
      .from(commissionPhases)
      .where(eq(commissionPhases.id, id))
      .limit(1);

    if (!existing) throw new NotFoundError('Commission phase not found');

    const [updated] = await db
      .update(commissionPhases)
      .set({ ...data, updated_at: new Date() })
      .where(eq(commissionPhases.id, id))
      .returning();

    return updated;
  },

  async getCommissionStartDate() {
    const [row] = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, 'commission_start_date'))
      .limit(1);

    if (!row) throw new NotFoundError('commission_start_date not configured');

    return { start_date: row.value };
  },

  async updateCommissionStartDate(value: string) {
    await db
      .insert(platformConfig)
      .values({ key: 'commission_start_date', value })
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: { value, updated_at: new Date() },
      });

    return { start_date: value };
  },

  async getCurrentCommission() {
    return getCommissionConfig(db);
  },
```

- [ ] **Step 3: Add routes**

Read `apps/backend/src/features/admin/routes.ts` and append after the last route (before the closing):

```typescript
import { updatePhaseSchema, updateStartDateSchema } from './schema';
import { commissionPhases } from '../../shared/db/schema';

  .get(
    '/commission/phases',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.listCommissionPhases(), set);
    },
    { requireAuth: true },
  )
  .put(
    '/commission/phases/:id',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.updateCommissionPhase(params.id, body), set);
    },
    { body: updatePhaseSchema, requireAuth: true },
  )
  .get(
    '/commission/start-date',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getCommissionStartDate(), set);
    },
    { requireAuth: true },
  )
  .put(
    '/commission/start-date',
    ({ user, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.updateCommissionStartDate(body.value), set);
    },
    { body: updateStartDateSchema, requireAuth: true },
  )
  .get(
    '/commission/current',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getCurrentCommission(), set);
    },
    { requireAuth: true },
  );
```

- [ ] **Step 4: Run admin tests**

Run: `cd apps/backend && bun test src/features/admin/`
Expected: existing tests pass. New endpoints untested at this point (handled in Task 8).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/admin/
git commit -m "feat: add admin commission API endpoints"
```

---

### Task 8: Fix Tests & Mobile References

**Files:**
- Modify: `apps/backend/src/features/trips/trips.test.ts`
- Modify: `apps/backend/src/features/trips/trips.collect.test.ts`
- Modify: `apps/backend/src/features/admin/admin.test.ts`
- Modify: `apps/backend/src/features/earnings/earnings.test.ts`
- Modify: `apps/mobile/src/api/types.ts`
- Modify: `apps/mobile/src/screens/EarningsScreen.tsx`
- Modify: `apps/mobile/src/screens/TripCompleteScreen.tsx` (no change needed — uses trip-level `platform_fee`)
- Modify: `apps/mobile/src/screens/IncomingRequestScreen.tsx` (no change needed — uses trip-level `platform_fee`)

**Interfaces:**
- Removes all `commission_exempt_until` references from tests and mobile types

- [ ] **Step 1: Fix trips test files**

Search `commission_exempt_until` in backend:

```
apps/backend/src/features/trips/trips.test.ts — lines 367, 501, 537
apps/backend/src/features/trips/trips.collect.test.ts — line 327
```

Each occurrence is `.set({ commission_exempt_until: null })`. Remove each `.set({ commission_exempt_until: null })` call. Before the `.set(...)` with the exempt null, there's a multi-field `.set({ status, updated_at, ..., commission_exempt_until: null })`. Remove just the `commission_exempt_until: null` from the object.

For `trips.test.ts`, read the surrounding context for each line and remove the field:

Line ~367: likely inside an insert or update — just remove `commission_exempt_until: null,` from the values object.
Line ~501: same.
Line ~537: same.

For `trips.collect.test.ts`, line 327: same pattern — remove the field.

- [ ] **Step 2: Fix admin test**

Read `apps/backend/src/features/admin/admin.test.ts`. Check if it references `commission_exempt_until`. Based on the grep earlier, it doesn't. Add a test for the new commission endpoints:

```typescript
// In the describe block for admin routes, add:

describe('commission phases', () => {
  test('GET /admin/commission/phases requires admin', async () => {
    const driverToken = await createDriverAndToken();
    const res = await request('GET', '/admin/commission/phases', undefined, driverToken);
    expect(res.status).toBe(403);
  });

  test('GET /admin/commission/phases returns phases', async () => {
    const adminToken = await createAdminAndToken();
    const res = await request('GET', '/admin/commission/phases', undefined, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(4);
  });

  test('PUT /admin/commission/phases/:id updates a phase', async () => {
    const adminToken = await createAdminAndToken();
    // First, get phases to find an ID
    const listRes = await request('GET', '/admin/commission/phases', undefined, adminToken);
    const phaseId = listRes.data[0].id;
    const res = await request('PUT', `/admin/commission/phases/${phaseId}`, { base_rate: 0.02 }, adminToken);
    expect(res.status).toBe(200);
    expect(res.data.base_rate).toBe(0.02);
  });

  test('PUT /admin/commission/start-date sets date', async () => {
    const adminToken = await createAdminAndToken();
    const res = await request('PUT', '/admin/commission/start-date', { value: '2026-01-01' }, adminToken);
    expect(res.status).toBe(200);
    expect(res.data.start_date).toBe('2026-01-01');
  });

  test('GET /admin/commission/current returns phase info', async () => {
    const adminToken = await createAdminAndToken();
    // Set start date first
    await request('PUT', '/admin/commission/start-date', { value: '2026-10-01' }, adminToken);
    const res = await request('GET', '/admin/commission/current', undefined, adminToken);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('phase');
    expect(res.data).toHaveProperty('currentMonth');
    expect(res.data).toHaveProperty('rate');
  });
});
```

- [ ] **Step 3: Fix earnings test**

Check `apps/backend/src/features/earnings/earnings.test.ts` for `commission_exempt_until`. If present, remove assertions against it.

- [ ] **Step 4: Fix mobile types**

Read `apps/mobile/src/api/types.ts` line 139-151. Remove `commission_exempt_until` from the schema:

Change:
```typescript
export const earningsDailySchema = z.object({
  total: z.number(),
  cash: z.number(),
  transfer: z.number(),
  trip_count: z.number(),
  trips: z.array(earningsTripSchema).optional(),
  yesterday: z.number().optional(),
  week: z.number().optional(),
  week_platform_fee: z.number().optional(),
  week_total_fare: z.number().optional(),
  platform_debt: z.number().optional(),
  commission_exempt_until: z.string().nullable().optional(),
});
```

Remove line 150:
```typescript
  commission_exempt_until: z.string().nullable().optional(),
```

- [ ] **Step 5: Fix EarningsScreen**

Read `apps/mobile/src/screens/EarningsScreen.tsx` lines 91-94. Replace:

```typescript
  const isExempt =
    earnings?.commission_exempt_until != null
      ? new Date(earnings.commission_exempt_until) > new Date()
      : false;
```

With:
```typescript
  const isExempt = retentionPercent === 0;
```

This keeps the "Sin comision!" badge working — it now shows when the actual retention is 0% (which happens during the Lanzamiento phase).

- [ ] **Step 6: Run all backend tests**

Run: `cd apps/backend && bun test`
Expected: all tests pass.

- [ ] **Step 7: Run type check on both apps**

Run: `cd /home/marti/Documentos/LIfty/software-lifty && bun run typecheck`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/features/trips/trips.test.ts apps/backend/src/features/trips/trips.collect.test.ts apps/backend/src/features/admin/admin.test.ts apps/backend/src/features/earnings/earnings.test.ts apps/mobile/src/api/types.ts apps/mobile/src/screens/EarningsScreen.tsx
git commit -m "test: fix tests and types after commission_exempt_until removal"
```

---

## Verification

After all tasks are complete:

1. `bun run typecheck` — passes with no errors
2. `bun test` (backend) — all tests pass
3. `bun test` (mobile) — all tests pass
4. Manual verification: `GET /admin/commission/current` returns correct phase for configured start date
