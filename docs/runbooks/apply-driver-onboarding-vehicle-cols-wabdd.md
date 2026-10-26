# Runbook — Apply driver onboarding vehicle/license cols on wabdd (#451–#453)

**Why:** Railway code post monorepo **#451 / #452 / #453** selects:

- `drivers.license_category`
- `drivers.license_professional_status`
- `drivers.professional_license_grace_started_at`
- `drivers.professional_license_due_at`
- `vehicles.engine_cc`
- `vehicles.insurance_coverage_type`

If these migrations were **not** applied on canonical Supabase **wabdd**
(`wabddbkwugepkwrgzhpk`), Postgres returns **42703** and the API turns it into
`INTERNAL_ERROR` 500 on:

- `GET /api/drivers/me/status` → SessionRestore / Welcome handoff (“Internal server error”)
- `PUT /api/drivers/me` (Paso 2/3 vehicle) → same toast after Continuar
- `GET /api/drivers/me` (profile hydrate)

Same class as commission receipts drift (`0048` / runbook
`apply-driver-commission-receipts-wabdd.md`). Soft-fallback in backend can stop the
500; **apply SQL anyway** so moto cc, insurance coverage, and license grace persist.

## Apply (ops with DB access)

1. Supabase Dashboard → project **wabdd** → SQL Editor  
   **or** `psql` to Session/Transaction pooler with a privileged role.
2. Run (idempotent `IF NOT EXISTS`):

```sql
-- 0049 / 20261024010000_driver_professional_license_grace
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_category varchar(30),
  ADD COLUMN IF NOT EXISTS license_professional_status varchar(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS professional_license_grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS professional_license_due_at timestamptz;

COMMENT ON COLUMN drivers.license_category IS 'Declared license class e.g. A3, B, professional';
COMMENT ON COLUMN drivers.license_professional_status IS 'unknown | professional | pending_professional | not_required';
COMMENT ON COLUMN drivers.professional_license_grace_started_at IS 'First successful is_online=true when pending_professional';
COMMENT ON COLUMN drivers.professional_license_due_at IS 'grace_started_at + 60 days; one-shot';

-- 0050 / 20261025010000_vehicle_engine_cc
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS engine_cc integer;

COMMENT ON COLUMN vehicles.engine_cc IS 'Moto cilindrada declarada (cc); auto null. Min policy 150 for motorcycle.';

-- 0051 / 20261025020000_vehicle_insurance_coverage_type
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_coverage_type varchar(30);

COMMENT ON COLUMN vehicles.insurance_coverage_type IS 'Moto póliza: third_party | comprehensive; auto null.';
```

Source files (same SQL):

- `apps/backend/src/shared/db/migrations/0049_driver_professional_license_grace.sql`
- `apps/backend/src/shared/db/migrations/0050_vehicle_engine_cc.sql`
- `apps/backend/src/shared/db/migrations/0051_vehicle_insurance_coverage_type.sql`
- `apps/backend/supabase/migrations/20261024010000_driver_professional_license_grace.sql`
- `apps/backend/supabase/migrations/20261025010000_vehicle_engine_cc.sql`
- `apps/backend/supabase/migrations/20261025020000_vehicle_insurance_coverage_type.sql`

3. Verify:

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'drivers' AND column_name IN (
  'license_category', 'license_professional_status',
  'professional_license_grace_started_at', 'professional_license_due_at'
))
OR (table_name = 'vehicles' AND column_name IN ('engine_cc', 'insurance_coverage_type'))
ORDER BY 1, 2;
-- expect 6 rows
```

4. Smoke (driver JWT):

```bash
curl -sS -H "Authorization: Bearer ***" \
  "https://liftybackend-production.up.railway.app/api/drivers/me/status"
# expect 200 + step profile|kyc|vehicle|documents|review|approved — never 500
```

5. If using Supabase CLI history, repair after manual apply:

```bash
cd apps/backend
supabase migration repair --status applied 20261024010000
supabase migration repair --status applied 20261025010000
supabase migration repair --status applied 20261025020000
```

## Do not

- Point local `DATABASE_URL` (`localhost:5433`) at this and assume prod is fixed.
- “Fix” only the mobile app — the 500 is backend/DB.
- Re-open greenfield #451–#453 features; this is **ops schema** (+ optional soft-fallback PR).
