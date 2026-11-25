# Territorial resolution — coords-first municipality gate

**Status:** implemented (backend + driver mobile)  
**Related:** `docs/architecture/service-markets-multi-city.md`, case Pedanía Dolores / Nicolás Arias

## Problem

Photon reverse-geocode can label the Villa Dolores hub as **Pedanía Dolores** (OSM admin unit).  
Old driver onboarding matched **text city → district** and only then checked pickup coords.  
A pin inside the active VD market could still become `municipality_status=waitlisted` → GO blocked ("Municipio no habilitado").

## Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| **Geocoder** (Photon / Nominatim) | Human-readable address only (`geocoder_city`, label line) |
| **Service markets** (hub + `pickup_radius_km`) | Operational fence — **coords decide** |
| **Districts** | Legal annex / `intended_district_id` after market hit |

Photon city text **never** grants or denies `operational`.

## Resolve algorithm (`resolveTerritoryFromCoords`)

1. Validate lat/lng.
2. Optional: if `accuracy_m > 500` → `unresolved` (`accuracy_insufficient`).
3. `market = findPickupMarket(lat,lng)` (active service markets cache).
4. **If market:**  
   - district = `market.default_district_id` else match `market.name`+`province` against active districts  
   - status = **`operational`**  
   - `address_resolved_city` = canonical district/market name  
   - `geocoder_*` = raw Photon labels (audit)  
   - `resolution_method` = `service_market_hub`
5. **If no market:** **`waitlisted`**, method `none`, show geocoder labels for copy.
6. **If no coords after geocode:** throw `ADDRESS_UNRESOLVABLE` or status `unresolved`.

Heal path: on `GET /drivers/me/status` and `toggleOnline`, if status is `waitlisted|unresolved` and pin is inside a market → rewrite to operational (no re-geocode).

## Schema (migration 0066)

`drivers` adds:

- `geocoder_city`, `geocoder_province`
- `resolution_method`
- `service_market_id`
- `address_accuracy_m`

`municipality_status` values: `unset | operational | waitlisted | unresolved`

## Why not PostGIS polygons yet

- Local/test DB has **no PostGIS** extension enabled by default.
- Product fence today is **service market hub + radius** (architecture SoT), not cadastral municipality polygons.
- Reliable Argentine municipal polygons (IGN / OSM admin boundaries) need a dedicated data import + legal review before becoming the ops gate.
- **Phase 2 (optional):** enable `postgis` on Supabase, store multipolygons per market or district, `ST_Covers` as alternate fence; keep hub+radius as fallback.

Do **not** invent boundaries. Until verified GeoJSON is loaded, hub+radius is the intentional fence (8 km VD pickup, etc.).

## Passenger note

Passengers do **not** use `municipality_status`. Trip request already uses `assertTripInsideServiceArea` (coords → market). Home OOF banner uses the same markets API. No passenger schema change in this slice.

## Deploy

1. Apply migration `0066_driver_territorial_resolution_audit` on wabdd (session pooler `:5432`).
2. Deploy backend (VPS CD from `main`).
3. Optional mobile APK if UX for `unresolved` is needed; heal works server-side on status/online without APK.
4. Audit waitlisted drivers with coords inside pickup → heal on next status fetch.

## Files

- `apps/backend/src/features/drivers/municipality.ts` — engine
- `apps/backend/src/features/drivers/service.ts` — wire + heal + soft geocode
- `apps/backend/src/shared/lib/service-area.ts` — `default_district_id` on market geo
- `apps/backend/src/features/service-markets/service.ts` — load default_district_id into cache
- `apps/backend/src/shared/db/schema/drivers.ts` + migration 0066
- `apps/mobile` — types + GO banner/copy for `unresolved`
