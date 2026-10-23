# Runbook — Apply driver commission receipts migration on wabdd

**Why:** Railway code (post #439/#440) selects `drivers.commission_fraud_block` and
`driver_commission_receipts`. If migration `0048` /
`20261023010000_driver_commission_receipts` was **not** applied on canonical Supabase
`wabdd` (`wabddbkwugepkwrgzhpk`), then:

- `GET /api/admin/drivers/:id` → **500** `INTERNAL_ERROR` (ficha Conductores)
- `GET /api/admin/commission/receipts` → **500**
- list `GET /api/admin/drivers` still **200** (does not select that column)

Backend may soft-fallback after the residual fix PR; **apply SQL anyway** so fraud block
and receipts work for real.

## Apply (ops with DB access)

1. Supabase Dashboard → project **wabdd** → SQL Editor  
   **or** `psql` to Transaction/Session pooler with a privileged role.
2. Run the contents of:
   - `apps/backend/supabase/migrations/20261023010000_driver_commission_receipts.sql`
   - same as `apps/backend/src/shared/db/migrations/0048_driver_commission_receipts.sql`

```sql
CREATE TABLE IF NOT EXISTS driver_commission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount_ars integer NOT NULL,
  debt_before_ars integer NOT NULL,
  file_url text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  note text
);

CREATE INDEX IF NOT EXISTS idx_driver_commission_receipts_driver_id
  ON driver_commission_receipts (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_commission_receipts_status
  ON driver_commission_receipts (status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_commission_receipt_pending
  ON driver_commission_receipts (driver_id)
  WHERE status = 'pending_review';

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS commission_fraud_block boolean NOT NULL DEFAULT false;
```

3. Verify via PostgREST (service role) or SQL:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'drivers' AND column_name = 'commission_fraud_block';
-- 1 row

SELECT to_regclass('public.driver_commission_receipts');
-- driver_commission_receipts
```

4. Smoke:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_JWT" \
  "https://liftybackend-production.up.railway.app/api/admin/drivers/<driver_uuid>"
# expect 200
```

5. If using Supabase CLI history, repair track after manual apply:

```bash
cd apps/backend
supabase migration repair --status applied 20261023010000
```

## Do not

- Point local `DATABASE_URL` (localhost:5433) at this and assume prod is fixed.
- Re-merge listDrivers #441 — wrong surface.
