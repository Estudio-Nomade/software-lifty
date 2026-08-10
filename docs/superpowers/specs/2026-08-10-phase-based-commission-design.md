# Phase-Based Driver Commission

**Date**: 2026-08-10
**Status**: Design approved — backend implementation pending

## Overview

Replace the hardcoded 20% commission rate and the first-10-drivers exemption system with a **global phase/month-based commission model**. An admin-configured start date determines the current month, and each phase defines the commission rate for its month range. The admin can adjust all phase parameters from a backend API (dashboard UI deferred to a future iteration).

## Commission Model

| Phase | Month(s) | Default Rate | Rule | Goal |
|---|---|---|---|---|
| Lanzamiento | 1 | 0% | Fixed | Captar 30-50 conductores |
| Medición | 2 | 5% | Fixed | Conocer capacidad real de generación |
| Estabilización | 3-6 | 10% | Fixed | Operación estable |
| Crecimiento | 7+ | 10% +0.7%/mes | Incremental until cap (15%) | Camino a 15% |

- **Month counter**: starts at 1 on `commission_start_date` and increments each calendar month.
- **Growth phase**: rate = `base_rate + (current_month - month_start) * monthly_increment`, capped at `cap_rate`.
- **Admin overrides**: all phase parameters are editable via the admin API.
- **All active drivers** use the current phase's rate. No individual exemptions.

## Database Changes

### New tables

**`commission_phases`**:

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(50) | e.g. "Lanzamiento" |
| month_start | INTEGER | First month this phase applies |
| month_end | INTEGER nullable | Last month; null = indefinite (last phase) |
| base_rate | DOUBLE PRECISION | Base commission rate (0.00–1.00) |
| monthly_increment | DOUBLE PRECISION nullable | +rate per month for growth phases |
| cap_rate | DOUBLE PRECISION nullable | Maximum rate for growth phases |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**`platform_config`**:

| Column | Type | Description |
|---|---|---|
| id | UUID PK | |
| key | VARCHAR(100) UNIQUE | e.g. "commission_start_date" |
| value | TEXT | configuration value |
| updated_at | TIMESTAMP | |

### Seed data

```sql
INSERT INTO commission_phases (name, month_start, month_end, base_rate, monthly_increment, cap_rate) VALUES
  ('Lanzamiento',   1, 1,    0.00, NULL,  NULL),
  ('Medición',      2, 2,    0.05, NULL,  NULL),
  ('Estabilización',3, 6,    0.10, NULL,  NULL),
  ('Crecimiento',   7, NULL, 0.10, 0.007, 0.15);
```

### Migration

- **`0031_commission_phases.sql`**: create `commission_phases` + `platform_config` tables, insert seed data, drop `drivers.commission_exempt_until`.
- **Drizzle schema**: remove `commission_exempt_until` from `drivers.ts`, add `commissionPhases` and `platformConfig` to schema index.

## Backend Changes

### New module: `apps/backend/src/shared/lib/commission.ts`

```typescript
export async function getCommissionRate(db: Pool): Promise<number> {
  const startDate = await getConfig(db, 'commission_start_date');
  const currentMonth = differenceInCalendarMonths(new Date(), startDate) + 1;

  const phase = await db.query(`
    SELECT * FROM commission_phases
    WHERE month_start <= $1 AND (month_end IS NULL OR month_end >= $1)
  `, [currentMonth]);

  if (!phase.monthly_increment) return phase.base_rate;

  const extraMonths = currentMonth - phase.month_start;
  const rate = phase.base_rate + extraMonths * phase.monthly_increment;
  return phase.cap_rate ? Math.min(rate, phase.cap_rate) : rate;
}
```

### Refactored files

| File | Change |
|---|---|
| `shared/lib/pricing.ts` | Default `commissionRate` becomes dynamic: call `getCommissionRate()` instead of `0.2`. `commission_rate` param still accepted for tests but the default fetches from DB. |
| `shared/lib/fuel-pricing.ts` | Same: use `getCommissionRate()` instead of default `0.2`. |
| `features/trips/service.ts` | Remove `commission_exempt_until` check in `createTrip()` and `createPendingTrip()`. The rate comes from pricing layer. |
| `features/drivers/service.ts` | Remove `commissionExemptUntil` assignment logic (~L275-280). |
| `features/drivers/schema.ts` | Remove `commission_exempt_until` from select/insert schemas. |
| `shared/db/schema/drivers.ts` | Remove `commission_exempt_until` column. |

### Admin API endpoints (extend `features/admin/routes.ts`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/admin/commission/phases` | List all phases | admin |
| PUT | `/admin/commission/phases/:id` | Update a phase (rate, increment, cap, month range) | admin |
| GET | `/admin/commission/start-date` | Get current start date | admin |
| PUT | `/admin/commission/start-date` | Set start date | admin |
| GET | `/admin/commission/current` | Current phase name + effective rate | admin |

### Validation schemas (extend `features/admin/schema.ts`)

Elysia `t.Object` schemas for phase update (all fields optional, at least one required) and start-date update.

## Mobile App Changes

- **`TripCompleteScreen.tsx`**: remove `commission_exempt_until` check — the "Sin comisión!" badge still shows when rate = 0%.
- **`IncomingRequestScreen.tsx`**: same.
- **`EarningsScreen.tsx`**: remove `commissionExemptUntil` from API types and display logic.
- **`OnlineScreen.tsx`**: remove exempt-related logic.
- **`api/types.ts`**: remove `commission_exempt_until` from `earningsDailySchema`.

The rate the driver sees comes from the trip-level `platform_fee / total_fare`, which is already computed and stored.

## Future: Admin Dashboard (deferred)

When the admin dashboard is ready, implement:

- **Section "Comisiones"**: CRUD form for phases (table view + edit drawer), start date picker, current phase display with effective rate.
- **API consumed**: the endpoints defined above in `/admin/commission/*`.

The dashboard location and stack will be provided at implementation time.

## Testing

- **Unit test**: `commission.test.ts` — verify `getCommissionRate()` returns correct rate for each month (1, 2, 3, 7, 14, with and without cap).
- **Integration**: `admin.test.ts` — extend existing admin tests with commission phase CRUD.
- **Existing tests**: update any tests that reference `commission_exempt_until` or hardcoded `0.2`.

## Risks

- **`commission_start_date` not configured**: if missing, fall back to a sensible default (e.g., oldest driver `created_at` or a hardcoded date). Throw a clear error.
- **Overlapping phases**: prevent via application validation (no overlapping `month_start`/`month_end` ranges).
- **Migration rollback**: the `DROP COLUMN commission_exempt_until` is irreversible. Ensure data is backed up before running migration.

## Migration Checklist

1. Create `supabase/migrations/0031_commission_phases.sql`
2. `supabase db push` to apply
3. Deploy backend with schema + logic changes
4. Verify `GET /admin/commission/current` returns the expected phase
