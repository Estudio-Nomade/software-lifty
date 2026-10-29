# PROMPT — feat(backend): asymmetric service area pickup 8 km / dropoff 50 km (A1)

**Modo:** IMPLEMENTAR + PR (tests; no investigate-only).  
**Idioma:** español en commits/PR body; handoff en ES.  
**1 issue = 1 rama = 1 PR.**

---

## Kickoff

| Campo | Valor |
|-------|--------|
| Repo | `/home/marti/Documentos/LIfty/software-lifty` |
| App | **`apps/backend` only** |
| Base | `origin/main` tip **re-fetch** — expect post-**#476** (`26b5353+`) |
| Branch | `feat/backend-asymmetric-service-area-pickup-8-dropoff-50` |
| ClickUp | https://app.clickup.com/t/1dfc7p9w0wt · claim `in progress` · complete **solo post-merge** |
| Epic | https://app.clickup.com/t/1dfc7p9vzpr (LOCK D) |
| Deps | none code — tip already has #475 fence + #476 SP/VS onboarding. **No rehacer** #472–#476 greenfield |
| Backlog SoT | `docs/handoffs/BACKLOG-launch-service-area-50km-vd-localities.md` § A1 LOCK D |
| GH | `gh auth switch --user martiyaquinta` |
| PATH | `export PATH="$HOME/.bun/bin:$PATH"` |

### Título PR / commit

```
feat(backend): asymmetric service area pickup 8 km dropoff 50 km
```

commitlint subject-case: **lowercase** after type (no Start Case).

---

## Por qué (producto — LOCK D Marti 2026-10-29)

No es “origen y destino en el mismo círculo”.

| | km | Qué |
|--|-----|-----|
| Hub | VD `-31.9449464, -65.1905677` | **un solo centro** |
| **Pickup (origen)** | **8** | pedís acá (casco + SP/VS/Piedra Pintada…) |
| **Dropoff (destino)** | **50** | podés **ir** hasta Rosas / Valle… |

Regla clave:

> **NO** pedir un viaje *desde* Las Rosas (~13 km).  
> **SÍ** pedir *desde* Villa Dolores (núcleo) *hasta* Las Rosas.

Hoy (#475): `assertTripInsideLaunchCluster` = **mismo** radio **20 km** en origin **y** dest, OR multi-hub VD/SP/VS → permite “desde Rosas” y no modela dropoff 50.

A1 = **SoT geo server asimétrico**. A2 (anti-spoof driver) reusa `isInsidePickupArea` — **no** lo implementes acá.

---

## Product locks (no negociar)

| Lock | Valor |
|------|--------|
| Hub | **solo** Villa Dolores `-31.9449464, -65.1905677` |
| Fence | **NO** OR multi-hub (SP/VS hubs salen del fence o quedan comment-only) |
| `PICKUP_RADIUS_KM` | **8** |
| `DROPOFF_RADIUS_KM` | **50** |
| Enforce | origin ∈ pickup · dest ∈ dropoff en **fare-estimate** y **requestTrip** |
| Error codes | prefer `OUT_OF_PICKUP_AREA` vs `OUT_OF_DROPOFF_AREA` (HTTP **400** AppError). Si unificás un code, **messages distintas** y tests por mensaje/label |
| Mensajes ES | honestos: pickup = “no pedimos viajes desde esa zona”; dropoff = “destino fuera del alcance Lifty (~50 km desde Villa Dolores)” — no genérico vacío |
| Reusar | `haversineDistance` de `shared/lib/geo.ts` |
| No DB | fence **no** depende de UUID districts |

### Coords de evidencia (tests)

| Lugar | approx | km≈VD | pickup 8 | dropoff 50 |
|-------|--------|-------|----------|------------|
| VD hub | -31.9449, -65.1906 | 0 | sí | sí |
| SP | -31.936553, -65.2189268 | ~2.8 | sí | sí |
| VS | -31.9358863, -65.1915949 | ~1.1 | sí | sí |
| Villa de las Rosas | ~-31.947, -65.053 (ajustar haversine ~13) | ~13 | **no** | **sí** |
| Las Tapias | ~-31.98, -65.10 (ajustar ~9.3) | ~9.3 | **no** | **sí** |
| CABA | -34.6037, -58.3816 | — | no | no |
| Córdoba capital | -31.4201, -64.1888 | — | no | no |

**Tip:** no hardcodees km mágicos mal medidos — usá haversine en el test o coords ya usadas en tip si calzan. Rosas/Tapias: podés fijar un punto sintético a distancia conocida del hub (ej. offset lng) si preferís determinismo.

### Out of scope (NO tocar)

- Driver `resolveMunicipalityFromAddress` anti-spoof (**A2** CU `1dfc7p9w0wu`)
- Allowlist Piedra Pintada / Sauce / San Pablo (**A3** `1dfc7p9w0wv`)
- Mobile pax copy (**A4** `1dfc7p9vzpw`) / driver copy (**A5** `1dfc7p9w0ww`)
- Pin mapa (**A6** `1dfc7p9vzpx`) / catalog (**A7** `1dfc7p9vzpy`)
- Admin / tránsito / matching radius drivers / fare formula / commission
- `directions` / `geocode` / `autocomplete` enforce extra
- Google Places, multi-ciudad AR
- Apps `mobile` / `mobile-passengers` (cero)

---

## Estado tip (verificar primero)

```bash
git fetch origin main
git rev-parse origin/main
# expect ancestor: 26b5353 #476, 9ea8ffb #475

git show origin/main:apps/backend/src/shared/lib/service-area.ts
# hoy: LAUNCH_CLUSTER_RADIUS_KM = 20 + 3 hubs + isInsideLaunchCluster + assertTripInsideLaunchCluster

git grep -n "assertTripInsideLaunchCluster\|isInsideLaunchCluster" origin/main -- apps/backend
# wire: maps/service.ts fareEstimate · passenger-trips/service.ts requestTrip
```

**Evolucioná el archivo existente** — no crees un segundo fence paralelo sin deprecar el viejo.

---

## Design

### A. `apps/backend/src/shared/lib/service-area.ts`

Shape objetivo (nombres exactos preferidos):

```ts
export const SERVICE_AREA_HUB = {
  name: 'Villa Dolores',
  lat: -31.9449464,
  lng: -65.1905677,
} as const;

export const PICKUP_RADIUS_KM = 8;
export const DROPOFF_RADIUS_KM = 50;

/** @deprecated tip #475 name — prefer isInsidePickupArea (same 8 km hub VD). */
// optional thin alias during migrate if many imports — prefer rename + update call sites

export function isInsidePickupArea(lat: number, lng: number): boolean { /* hub + PICKUP */ }
export function isInsideDropoffArea(lat: number, lng: number): boolean { /* hub + DROPOFF */ }

export function assertInsidePickupArea(lat, lng, label?): void
export function assertInsideDropoffArea(lat, lng, label?): void

export function assertTripInsideServiceArea(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): void {
  assertInsidePickupArea(origin.lat, origin.lng, 'origin');
  assertInsideDropoffArea(dest.lat, dest.lng, 'destination');
}
```

Legacy exports:

- Prefer **rename** call sites a `assertTripInsideServiceArea`.
- Si dejás `assertTripInsideLaunchCluster` como alias → **debe** ser asimétrico (no 20 km simétrico). Documentá deprecation en comment 1 línea.
- `isInsideLaunchCluster` → alias de **pickup** (8 km) **o** borrar y actualizar tests. **No** dejes 20 km OR multi-hub vivo.

Log warn structured (sin PII de más): code + label + lat/lng como tip #475.

### B. Wire (ya existe — solo import/API)

- `apps/backend/src/features/maps/service.ts` → `fareEstimate`  
- `apps/backend/src/features/passenger-trips/service.ts` → `requestTrip` **antes** de route/insert  

Si hoy llaman `assertTripInsideLaunchCluster`, cambiá a `assertTripInsideServiceArea` (o alias asimétrico).

### C. Tests

`apps/backend/src/shared/lib/service-area.test.ts` — reescribir casos:

1. hub / SP / VS coords → pickup **true**  
2. punto ~5 km → pickup true  
3. Rosas ~13 → pickup **false**, dropoff **true**  
4. Tapias ~9.3 → pickup **false**  
5. CABA / Córdoba capital → pickup false, dropoff false  
6. NaN → false  
7. `assertTrip`: VD → Rosas **OK**  
8. Rosas → VD → **reject pickup** (code/message)  
9. VD → CABA → **reject dropoff**  
10. origin outside + dest outside → falla en **origin** primero (orden documentado)

Integration:

- `maps.test.ts` / `passenger-trips.test.ts`: fixtures **dentro** de pickup para happy path; casos 400 con codes nuevos si assertan `OUT_OF_SERVICE_AREA` hoy → actualizar expect.

---

## Qué hacer (pasos)

1. `git fetch origin main` + `checkout -B feat/backend-asymmetric-service-area-pickup-8-dropoff-50 origin/main`
2. Leer `service-area.ts` + tests + wire maps/passenger-trips en tip
3. Implementar fence asimétrico + deprecar multi-hub 20
4. Actualizar unit + integration tests (RED→GREEN)
5. Verify scoped
6. Un conventional commit + PR a `main`
7. Comment ClickUp con PR URL; **no** complete hasta merge
8. Post-create: `gh pr comment N --body '/review'`

---

## Verify

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /home/marti/Documentos/LIfty/software-lifty

bun --filter @lifty/backend test src/shared/lib/service-area.test.ts
# + maps / passenger-trips si tocás fixtures:
bun --filter @lifty/backend test src/features/maps/maps.test.ts
bun --filter @lifty/backend test src/features/passenger-trips/passenger-trips.test.ts

# opcional scoped typecheck backend
bun --filter @lifty/backend exec tsc --noEmit
```

No hace falta full monorepo turbo si CI lo corre en PR — sí verde en tests del fence + wire.

---

## Entrega

1. Branch desde `origin/main` tip fresco  
2. **Un** commit conventional (subject lowercase)  
3. PR a `main` con body:
   - ClickUp https://app.clickup.com/t/1dfc7p9w0wt  
   - Epic LOCK D  
   - Root cause 3–5 líneas (20 km simétrico → pickup 8 / dropoff 50, un hub)  
   - Test plan  
4. `gh pr comment N --body '/review'`  
5. ClickUp comment PR URL — **complete solo post-merge**  
6. **No** `git add -A` (no APKs, no `.ops-local`, no handoffs ajenos, no WIP mobile)  
7. **No** implementes A2/A3/mobile en este PR  

### Anti-scope hard

- No “mientras estoy” allowlist San Pablo  
- No driver address geo gate  
- No copy TyC mobile  
- No subir pickup a 13 “para incluir Rosas”  
- No reintroducir OR multi-hub “por las dudas”

---

## Criollo

Hoy el círculo es 20 km y el mismo para pedir y para llegar.  
Queremos: **pedís cerca de Dolores (8 km)** y **podés irte hasta ~50 km**.  
Desde Rosas no se pide. Hasta Rosas sí.  
Solo backend fence + tests. El candado anti-trampa del conductor es el issue de después.
