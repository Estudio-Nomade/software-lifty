# Runbook — Seed / activate Tandil on the API DB Expo Go uses

**Symptom:** Conductor Expo Go Paso 1 shows **«Todavía no operamos acá»** for a Tandil
address even after multi-hub client code (#525).

**Root cause (lab):** `GET /api/service-markets/active` returns only `villa-dolores`.
Client + BE both deny Tandil. Admin may show Tandil if it points at another DB or
lists `draft`/`paused` (public `/active` is **status=active only**).

**Gate:** curl the **same** base URL Metro logs as `[API] Backend URL:`.

```bash
# local lab (mobile EXPO_PUBLIC_API_PORT=3001)
TOKEN=<driver jwt or dev user uuid>
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/service-markets/active | jq '.items[].slug'
# PASS: must include "tandil"
```

## Local docker (`lifty-dev-pg` / `DATABASE_URL=…localhost:5433/lifty`)

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd apps/backend
bun run db:seed-service-markets
# or full predev path:
bun run scripts/ensure-dev-infra.ts
```

Restart backend so in-memory geo cache reloads (`[service-markets] cache reloaded` → `active: 2`).

```bash
docker exec -i lifty-dev-pg psql -U lifty -d lifty -c \
  "SELECT slug, status, hub_lat, hub_lng FROM service_markets ORDER BY 1;"
```

## Cloud (wabdd / Railway API)

If Expo Go uses Railway (`EXPO_PUBLIC_API_URL=…railway…`), seed **that** project's DB
(SQL Editor or session pooler), not only docker local:

```sql
INSERT INTO service_markets (
  slug, name, province, status,
  hub_lat, hub_lng,
  pickup_radius_km, dropoff_radius_km, match_radius_km, geo_bias_radius_km,
  timezone
) VALUES (
  'tandil', 'Tandil', 'Buenos Aires', 'active',
  -37.3217, -59.1332,
  8, 50, 8, 20,
  'America/Argentina/Buenos_Aires'
)
ON CONFLICT (slug) DO UPDATE SET
  status = 'active',
  hub_lat = EXCLUDED.hub_lat,
  hub_lng = EXCLUDED.hub_lng,
  pickup_radius_km = EXCLUDED.pickup_radius_km,
  dropoff_radius_km = EXCLUDED.dropoff_radius_km,
  match_radius_km = EXCLUDED.match_radius_km,
  updated_at = now();

INSERT INTO service_market_aliases (market_id, alias, alias_normalized)
SELECT m.id, v.alias, v.norm
FROM service_markets m
CROSS JOIN (VALUES
  ('Tandil', 'tandil'),
  ('Tandil centro', 'tandil centro'),
  ('TDI', 'tdi')
) AS v(alias, norm)
WHERE m.slug = 'tandil'
ON CONFLICT DO NOTHING;
```

Or: `DATABASE_URL=<pooler> bun run db:seed-service-markets` from `apps/backend`.

Redeploy / restart API so `reloadServiceMarketsCache()` runs (boot).

If row exists as `draft`/`paused`: admin `POST /api/admin/service-markets/:id/activate`
or `UPDATE service_markets SET status='active' WHERE slug='tandil'`.

## Smoke Expo Go

1. Metro log `[API] Backend URL:` = URL where curl listed `tandil`.
2. Hard reload. Dev log: `[serviceMarkets] active: villa-dolores,tandil` (or order).
3. Onboarding Paso 1 → domicilio Tandil centro → **banner OFF**.
4. VD still OK; CABA / far pin → banner ON.

## Why migrate alone is not enough

`0055_service_markets.sql` seeds both hubs, but Drizzle journals the migration **once**.
A volume that applied schema (or an older seed) without the Tandil row never re-runs
INSERT. `db:seed-service-markets` + `ensure-dev-infra` close that gap.

## Refs

- Architecture: `docs/architecture/service-markets-multi-city.md`
- PR #525 client mirror (code only; ops was left open)
- Seed SoT: `apps/backend/src/shared/db/migrations/0055_service_markets.sql`
- Script: `apps/backend/scripts/seed-service-markets.ts`
