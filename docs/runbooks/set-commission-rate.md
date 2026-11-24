# Runbook — Set Lifty commission rate (flat %)

**SoT:** `platform_config.key = 'commission_rate'`  
**Value:** fraction string `"0"` … `"0.30"` (0%–30%). Soft-cap in code at 0.30.  
**Default / launch:** `"0"` (0%). Missing row → app treats as **0** (launch-safe, same split as explicit `"0"`).  
**Monitor missing vs explicit 0:** `GET /api/admin/commission/rate` → `raw === null` means row absent; SQL `WHERE key = 'commission_rate'`. Runtime pricing does not log — apply migration `0065` on every env.  
**Target post-launch:** `"0.05"` (5%) when ops says — **manual**, no cron.

Effect: only split `platform_fee` / `driver_earnings` on **new** trips.  
Does **not** change passenger fare. Does **not** rewrite past `trips.platform_fee`.

## SQL (wabdd / any env)

```sql
-- ensure row (idempotent seed)
INSERT INTO platform_config (key, value)
VALUES ('commission_rate', '0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- set 5%
UPDATE platform_config
SET value = '0.05', updated_at = now()
WHERE key = 'commission_rate';

-- back to 0%
UPDATE platform_config
SET value = '0', updated_at = now()
WHERE key = 'commission_rate';

-- verify
SELECT key, value, updated_at FROM platform_config WHERE key = 'commission_rate';
```

Apply on Supabase **wabdd** SQL Editor or session pooler.  
`git pull` alone does **not** migrate cloud — run migration / SQL explicitly.

## Script (local / VPS with DATABASE_URL)

```bash
cd apps/backend
# bare number = fraction 0–0.30 only; percent needs % suffix
bun run scripts/set-commission-rate.ts 0
bun run scripts/set-commission-rate.ts 0.05
bun run scripts/set-commission-rate.ts 5%
# NOT: bun run scripts/set-commission-rate.ts 5   ← rejected (use 5% or 0.05)
```

## Migration

- Drizzle: `apps/backend/src/shared/db/migrations/0065_commission_rate_flat.sql`
- Supabase: `apps/backend/supabase/migrations/20261124120000_commission_rate_flat.sql`

```bash
# remote (linked project)
cd apps/backend && supabase db push
```

## Notify drivers

When rate **changes**, `set-commission-rate.ts` (and admin PUT rate) call
`notifyDriversCommissionRateChanged`:

- Audience: drivers `status = approved`
- Inbox: `driver_account_messages.type = commission_rate_change`
- Push: title `Actualización de tu comisión`, data `type=driver:commission_rate_change`
- Same rate twice → **no** notify (`changed` check + `commission_rate_last_notified` claim)
- Concurrent script/admin with same rate → only one fan-out wins the claim

Optional human WA T-24h stays outside the app.

## Out of scope

- No phases / ramp / auto day-8  
- No `effective_from` scheduler v1  
- No per-driver or per-municipio rate  
