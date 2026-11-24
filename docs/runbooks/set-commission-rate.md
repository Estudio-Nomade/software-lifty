# Runbook — Set Lifty commission rate (flat %)

**SoT:** `platform_config.key = 'commission_rate'`  
**Value:** fraction string `"0"` … `"0.30"` (0%–30%). Soft-cap in code at 0.30.  
**Default / launch:** `"0"` (0%). Missing row → app treats as **0**.  
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
# fraction or percent:
bun run scripts/set-commission-rate.ts 0
bun run scripts/set-commission-rate.ts 0.05
bun run scripts/set-commission-rate.ts 5%
```

## Migration

- Drizzle: `apps/backend/src/shared/db/migrations/0065_commission_rate_flat.sql`
- Supabase: `apps/backend/supabase/migrations/20261124120000_commission_rate_flat.sql`

```bash
# remote (linked project)
cd apps/backend && supabase db push
```

## Notify drivers

When rate **changes**, PR2 hooks push + in-app `driver_account_messages`.  
Until then: optional human WA T-24h; app still serves new rate on next trip.

## Out of scope

- No phases / ramp / auto day-8  
- No `effective_from` scheduler v1  
- No per-driver or per-municipio rate  
