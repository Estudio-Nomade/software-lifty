# Service Markets — multi-ciudad / multi-municipio

**Estado:** slice 1 en curso (`feat/service-markets-multi-city`)  
**Producto:** Lifty crece ciudad por ciudad. Ops debe poder **agregar / pausar / ajustar** un mercado sin redeploy de constantes hardcodeadas.

## Problema hoy

| Capa | Hoy | Dolor |
|------|-----|--------|
| Geo viajes + driver home | `SERVICE_AREA_HUB` fijo Villa Dolores en código | No se puede “activar Tandil” sin PR |
| Districts | Tabla legal (TyC, tránsito, stickers) | No tiene hub/radios; no es fence |
| Photon / catalog | Bias y seeds VD | POIs y ranking no se reorientan al abrir ciudad |
| Admin | Lista districts solo para operadores tránsito | No hay CRUD de zona operativa |

## Separación de conceptos (cerrado)

```
service_markets     →  ¿Dónde opera Lifty? (geo + matching + autocomplete bias)
districts           →  ¿Qué anexo legal / tránsito aplica? (TyC, stickers, ops municipal)
localities (P2)     →  Parajes/barrios del mercado (aliases, label, maps_to_district)
```

- **Un market** = un hub (lat/lng) + radios pickup / dropoff / match.
- **Varios markets activos** a la vez (VD + Tandil + …).
- **Viaje v1:** origen debe caer en el **pickup** de algún market activo; el destino debe caer en el **dropoff del mismo market** (sin intercity todavía).
- **Conductor operational:** pin de domicilio dentro del **pickup** de algún market activo (+ match de district/locality para label legal).
- **Districts** siguen existiendo. Al crear un market se puede linkear `default_district_id` (TyC home).

## Modelo de datos (slice 1)

### `service_markets`
| Campo | Uso |
|-------|-----|
| `slug` | estable (`villa-dolores`, `tandil`) |
| `name`, `province` | UI / copy |
| `status` | `draft` \| `active` \| `paused` |
| `hub_lat`, `hub_lng` | centro del círculo |
| `pickup_radius_km` | default 8 — pedir viaje + driver home |
| `dropoff_radius_km` | default 50 — destino |
| `match_radius_km` | default 8 — nearby drivers |
| `geo_bias_radius_km` | default 20 — boost autocomplete local |
| `default_district_id` | FK opcional → `districts` |
| `timezone` | default `America/Argentina/Cordoba` |

### `service_market_aliases`
Aliases normalizados para match de ciudad en onboarding (`vd`, `v dolores`, `tandil centro`, …).

### Localities (slice 2 — no en migración 1)
Parajes tipo Piedra Pintada / Sauce Arriba: `role=core|dropoff_only`, coords aprox, `maps_to_district_id`.

## Reglas geo (multi-hub)

```
findPickupMarket(lat,lng) =
  active markets where dist(p, hub) <= pickup_radius_km
  → elegir el de menor distancia (empate: slug estable)

isInsidePickupArea = findPickupMarket != null

assertTrip(origin, dest):
  m = findPickupMarket(origin)
  if !m → OUT_OF_PICKUP_AREA
  if dist(dest, m.hub) > m.dropoff_radius_km → OUT_OF_DROPOFF_AREA
  // mismo market; no “origen VD destino hub Tandil”
```

Fallback de boot/tests: si DB vacía o cache fría, market legacy VD (mismas coords LOCK D).

## Flujo ops “agregar ciudad”

1. Admin → **Mercados** → Nuevo
2. Nombre, provincia, pin del hub (mapa), radios
3. (Opcional) crear/linkear `district` con TyC
4. Aliases de nombre
5. Guardar como `draft` → smoke en staging
6. **Activar** → invalida cache BE → pax/driver ya operan ahí
7. Pausar = deja de matchear / pedir / operational nuevo (cuentas ya adentro: política P2)

## Flujo técnico al activar

```
Admin POST/PATCH market
  → DB
  → reloadServiceMarketsCache()
  → service-area + matching + municipality leen markets activos
```

Mobile (slice 3): `GET /service-markets/active` para mirror de preview en onboarding (dejar de hardcodear hub en app).

Photon / catalog (slice 4):
- Bias default = GPS usuario o hub del market más cercano
- Catalog rows con `market_id` opcional
- Seeds POI por ciudad sin contaminar ranking de otra

## Cortes 1:1:1

| Slice | Qué | Repo |
|-------|-----|------|
| **S1** | Tabla + seed VD + service-area multi + cache + admin CRUD API + tests | backend monorepo |
| **S2** | Localities allowlist + municipality match por market | backend |
| **S3** | Mobile driver/pax: fetch markets activos, preview zona | mobile + passengers |
| **S4** | Photon bias multi + catalog por market | backend maps |
| **S5** | Admin UI Lifty Admin (mapa pin hub, activar/pausar) | `../apps/admin` |
| **S6** | Matching usa `match_radius_km` del market del origen | backend |

## Qué NO hacer

- Meter hub/radios adentro de `districts` (mezcla legal con geo)
- Un district por caserío
- Intercity automático día 1
- Confiar solo en texto de ciudad sin coords
- Activar Tandil en prod sin TyC/ops local si el producto lo exige (draft existe para eso)

## Seed inicial

- `villa-dolores` active — hub LOCK D, pickup 8, dropoff 50, match 8
- Aliases: villa dolores, vd, v dolores, …

Tandil **no** se seed-activa: se crea por admin cuando quieran probar.

## API (S1)

```
GET    /api/admin/service-markets
POST   /api/admin/service-markets
GET    /api/admin/service-markets/:id
PATCH  /api/admin/service-markets/:id
POST   /api/admin/service-markets/:id/activate
POST   /api/admin/service-markets/:id/pause
GET    /api/service-markets/active   # apps (auth)
```

## Verificación S1

- Tests unit service-area: VD igual que antes; con market Tandil active, pin Tandil = pickup ok y CABA no
- Viaje VD→Rosas ok; Tandil→VD (otro hub) dropoff fail si solo VD; con Tandil active origen Tandil ok
- Admin create draft + activate recarga cache
