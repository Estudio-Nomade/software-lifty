# Backlog — zona servicio 50 km VD + localidades / anti-spoof onboarding

**SoT producto (2026-10-29 → refinamiento Marti):**  
No es “origen y destino en el mismo círculo”.  
Regla de negocio clave (cancelaciones / deadhead):

> **Un pasajero NO puede pedir un viaje *desde* Las Rosas (u otro afuera del núcleo).**  
> **SÍ puede pedir *desde* Villa Dolores (núcleo) *hasta* Las Rosas / afuera cercano.**

1. **Viajes (pax) — asimétrico (LOCK D — Marti 2026-10-29):**
   - **Origen (pickup)** ∈ **núcleo** ≤ **8 km** del hub VD.
   - **Destino (dropoff)** ∈ **alcance** ≤ **50 km** del hub VD — “irme hasta allá” (Rosas, Tapias, Valle cercano…).
2. **Conductores (mismo núcleo 8 km — LOCK D + anti-fraude):**
   - Domicilio de onboarding **debe** resolverse en mapa (geocode / place con lat·lng reales).
   - Esas coords **≤ 8 km** del hub VD (`isInsidePickupArea`) → si no, **no operational** (waitlist / rechazo).
   - **No** alcanza escribir “calle X, Villa Dolores” a mano: el backend **no** confía solo en el texto ni en `matchDistrict` por nombre.
   - Allowlist de localidades (SP, VS, Piedra Pintada, …) solo **etiqueta** el barrio; el candado duro es **GPS del punto geocodificado**.
   - Matching no busca pax fuera del núcleo.

**Centro ref (LOCK):** Villa Dolores `-31.9449464, -65.1905677`.  
**Fence (LOCK D):** un hub VD · **no OR multi-hub**.

| Constante | km | Uso |
|-----------|-----|-----|
| `PICKUP_RADIUS_KM` | **8** | origin en fare + requestTrip; driver home / operational |
| `DROPOFF_RADIUS_KM` | **50** | dest en fare + requestTrip |

**Consecuencia mapa (evidence):**  
pickup 8 km → **dentro** SP (~3), VS (~1), Piedra Pintada (~4), Sauce Arriba (~4); **fuera** Las Tapias (~9.3), **Villa de las Rosas (~13)** → no se pide *desde* Rosas.  
dropoff 50 km → **sí** se puede ir *hasta* Rosas / Molles / Nono / Mina / etc.

### Qué era “OR multi-hub” (código #475)

```ts
// Hoy: true si el punto está a ≤ R de CUALQUIERA de los hubs
isInside = dist(p, VD)≤R  OR  dist(p, SP)≤R  OR  dist(p, VS)≤R
```

Con hubs a 1–3 km y R=20, el área se “hincha” un poco vs un solo círculo.  
Con **R=50 y un solo centro VD**, ese OR **no aporta**: todo el aglomerado cabe holgado. Más simple de explicar a ops y de testear.

### Aglomerado geográfico (evidence OSM/Nominatim + Photon, 2026-10-29)

Entidad municipal VD ≠ aglomerado urbano. Cabecera San Javier. Distancias haversine desde hub VD:

| Lugar | km ≈ VD | Nota OSM |
|-------|---------|----------|
| Villa Dolores | 0 | municipio cabecera |
| Villa Sarmiento | 1.1 | municipio propio |
| San Pedro | 2.8–3.0 | Municipio de San Pedro (Photon village) |
| Sauce Arriba | 4.1 | comuna |
| **Piedra Pintada** | 4.3 | **dentro Municipio de Villa Dolores** |
| Las Tapias | 9.3 | comuna |
| Villa de las Rosas | 13.1 | municipio (aglomerado Marti) |
| Los Molles | 17.5 | bajo Villa de las Rosas |
| Las Calles | 24.7 | seed histórico districts |
| Nono | 24.2 | |
| Luyaba | 26.0 | |
| Mina Clavero | 30.5 | seed histórico — **entra si radio=50** |
| La Paz (SJ) | 33.1 | |

**San Pablo:** Nominatim/Photon **no** devolvieron una locality clara “San Pablo” pegada a VD (sí ruido homónimos lejos). Tratar como **barrio/paraje a confirmar en Maps** + coords manuales en allowlist; no inventar district.

**Implicación LOCK D:** dropoff 50 km incluye Valle (Nono/Mina/La Paz) solo como **destino**. Pickup/drivers siguen en núcleo 8 km — no hay “pido desde Mina”.

Epic padre histórico: https://app.clickup.com/t/1dfc7p9vzpr (cluster 20 km × 3) — **evoluciona** a este modelo; no reabrir PRs #472–#476 greenfield.

Tip monorepo al redactar: post-**#476** (`26b5353+`).

---

## Modelo mental (arquitectura rideshare)

```
                    ┌──────────────────────────────────┐
                    │  SERVICE AREA (geo, BE SoT)      │
                    │  hub = VD                        │
                    │  pickup ≤ 8 km · dropoff ≤ 50 km │
                    │  fare + requestTrip enforce        │
                    └─────────────┬────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   origin ≤ 8 · dest ≤ 50   Driver home ≤ 8 km     Autocomplete bias
   (asimétrico)             + locality allowlist   / catalog rank
```

| Capa | Pregunta | SoT |
|------|----------|-----|
| **Service area** | ¿Puedo cotizar / pedir? | `service-area.ts` — origin vs dest **radios distintos**; solo coords |
| **Driver eligibility** | ¿Puede operar? | geocode → coords **≤ pickup 8 km** + allowlist núcleo |
| **District / tránsito** | ¿Anexo + stickers? | home **Villa Dolores** para parajes; SP/VS annex OK si ya existen |
| **Copy** | ¿Qué decimos? | “Pedís en VD y alrededores cercanos; podés ir hasta ~50 km” |

### Por qué no “un district por barrio”

- San Pablo / Piedra Pintada / etc. son **localidades/parajes**, no oficinas de tránsito ni anexos legales separados día 1.
- Tránsito MVP sigue siendo **una ventanilla VD** (#473).
- Explosión de rows `districts` + terms por caserío = ops/legal debt.
- **Allowlist de localidades** → `intended_district_id = Villa Dolores` (o el district home del cluster), con label resuelto en UI.

SP/VS ya seeded (#472): se pueden **seguir listando** en picker si tienen terms, **o** colapsar a “zona VD” en copy y mapear intended → VD. Decisión de producto en A3; default arquitecto: **mapear parajes → VD home**, mantener SP/VS districts solo si ya hay terms/annex en uso.

---

## Hueco de seguridad HOY (confirmado en tip)

`resolveMunicipalityFromAddress` (`drivers/service.ts`):

1. Geocode (lat/lng o address) → city/province  
2. `matchDistrict(city, province, activeDistricts)` **solo por nombre**  
3. Si matchea → `operational`

**No** exige `isInsidePickupArea(lat,lng)`.

Ataque trivial: texto/place “…, Villa Dolores, Córdoba” con coords lejos, o city parseable a un district activo sin estar en la zona.  
También: `cityNorm.includes(nameNorm)` es permisivo.

**Fix clase:** después de geocode, **gate geo** (misma función que fare/trip). String match solo elige *cuál* district/locality label; **no** otorga operational solo.

---

## Localidades / parajes (seed inicial — ampliar con evidence OSM/Photon)

| Nombre | km≈VD | Rol núcleo (pickup/driver) | Acción |
|--------|-------|----------------------------|--------|
| Villa Dolores | 0 | hub | already |
| Villa Sarmiento | 1.1 | núcleo | already district |
| San Pedro (CBA) | 2.8 | núcleo | already |
| Sauce Arriba | 4.1 | núcleo | **alta allowlist** |
| Piedra Pintada | 4.3 | núcleo (ejido VD) | **alta allowlist** |
| San Pablo | ? | núcleo si Maps confirma ≤8 | allowlist + coords manual |
| Las Tapias | 9.3 | **fuera pickup** · OK dropoff | no driver/pickup |
| Villa de las Rosas | 13.1 | **fuera pickup** · OK dropoff | no pedir *desde* |
| Los Molles / Nono / Mina… | 17–33 | solo dropoff (≤50) | no pickup/driver |

Cada entrada allowlist núcleo: `canonical_name`, `aliases[]`, `approx_lat/lng`, `maps_to_district: 'Villa Dolores'`.

---

## Corte 1:1:1 (PRs / ClickUp) — LOCK D

### A0 — Product lock doc (este archivo)  
Ya. No PR código.

### A1 — `feat(backend): asymmetric service area pickup 8 km dropoff 50 km`  
**CU:** https://app.clickup.com/t/1dfc7p9w0wt · handoff `PROMPT-feat-backend-asymmetric-service-area-pickup-8-dropoff-50.md`  
**Por qué primero:** SoT geo; pax + gates driver reusan.

**Hace:**
- Un hub VD; **deprecar OR multi-hub** (o dejar hubs solo doc)
- `PICKUP_RADIUS_KM = 8`, `DROPOFF_RADIUS_KM = 50`
- `isInsidePickupArea(lat,lng)` / `isInsideDropoffArea(lat,lng)`
- `assertTripInsideServiceArea(origin, dest)`:
  - origin must pickup · dest must dropoff
  - codes claros: p.ej. `OUT_OF_PICKUP_AREA` vs `OUT_OF_DROPOFF_AREA` (o un code + message distinta)
- Wire `fareEstimate` + `requestTrip`
- Tests:
  - origin VD dest Rosas (~13) → **OK**
  - origin Rosas dest VD → **reject pickup**
  - origin VD dest CABA → **reject dropoff**
  - origin SP/VS (~3) dest VD → **OK**
  - Tapias (~9.3) como origin → **reject** (borde 8)
- Mensajes ES honestos (no “fuera de zona” genérico si es “no pedimos desde ahí”)

**No hace:** mobile copy, localities list, pin, catalog, anti-spoof driver (A2).

**Deps:** none (tip #475).

---

### A2 — `fix(backend): driver address must geocode inside pickup area`  
**CU:** https://app.clickup.com/t/1dfc7p9w0wu — **seguridad / anti-fraude registro conductor**  
**Depende de:** A1 (`isInsidePickupArea` = **mismo 8 km** que pickup pax).

**Hace (obligatorio, Marti):**
- Flujo onboarding `PUT /drivers/me` address:
  1. Resolver ubicación real (geocode por address **o** lat/lng de place Maps/Photon del autocomplete — preferir coords del place elegido).
  2. Si no hay coords confiables → `ADDRESS_UNRESOLVABLE` (ya existe patrón).
  3. Si `!isInsidePickupArea(lat,lng)` (≤ **8 km** VD) → **no** `operational` (waitlisted + banner; opcional 400).
  4. Solo **después** match localidad/district / allowlist para label + `intended_district_id`.
- **Fraude a bloquear:** texto “… Villa Dolores” con pin/coords fuera del núcleo; city parseable a district sin punto en mapa del área.
- Mobile: forzar selección de sugerencia de autocomplete cuando se pueda (coords del place), no solo free-text sin geocode — si free-text, BE geocodea y igual aplica el radio.
- Tests: VD/SP/VS/Piedra Pintada coords OK; CABA no; string VD + coords lejos → no operational; Rosas (~13 km) como home → no operational
- Log warn structured (`ADDRESS_OUT_OF_PICKUP_AREA` o equivalente)

**No hace:** UI redesign; allowlist nombres (A3); pax fence (A1).

---

### A3 — `feat(backend): vd nucleo localities allowlist (piedra pintada, sauce arriba, san pablo, …)`  
**CU:** https://app.clickup.com/t/1dfc7p9w0wv  
**Depende de:** A2.

**Hace:**
- Allowlist núcleo (≤8 km): Piedra Pintada, Sauce Arriba, San Pablo (si coords), + SP/VS/VD
- Geo inside pickup **antes** de operational
- `intended_district_id` → home VD (default); SP/VS annex opcional
- Tests PUT /drivers/me
- **No** districts nuevos por caserío; **no** alta driver en Rosas/Tapias

---

### A4 — `fix(mobile-passengers): tyc copy pickup nucleo dropoff 50 km`  
**CU:** https://app.clickup.com/t/1dfc7p9vzpw (evolucionado LOCK D)  
**Depende de:** A1.

**Hace:** copy “pedís en VD y alrededores cercanos; podés ir hasta ~50 km”; no “pido desde cualquier lado a 50 km”.  
**No:** pin, fence client-only.

---

### A5 — `fix(mobile): driver onboarding copy nucleo localities`  
**CU:** https://app.clickup.com/t/1dfc7p9w0ww · **Depende de:** A2/A3.

---

### A6 — pin destino (PR-5 `1dfc7p9vzpx`)  
Client: dest ≤50; origin ya GPS/núcleo. Depende A1.

### A7 — catalog bias  
Bias/rank con hub VD; seeds núcleo + POIs dropoff frecuentes. Depende A1.

---

## Orden de merge

```
A1 pickup 8 / dropoff 50 (BE asimétrico)
  ↓
A2 anti-spoof driver home ≤ pickup (BE)
  ↓
A3 allowlist núcleo (Piedra Pintada, Sauce Arriba, San Pablo…)
  ├→ A4 pax copy
  ├→ A5 driver copy
  ├→ A6 pin
  └→ A7 catalog
```

**Nunca** un mega-PR.

---

## Qué NO hacer

- Mismo radio origin=dest (rompe regla Rosas)
- Dropoff 50 **sin** anti-spoof driver
- Pickup ≥13 km (reabre “pido desde Rosas”)
- OR multi-hub innecesario
- Districts por cada caserío
- Client-only fence
- Re-greenfield #472–#476
- Google Places

---

## ClickUp

Lista **Backlog** `901717866592` · Martina `101386911` · tag `ingenieria` · epic `1dfc7p9vzpr` + este doc.  
Deps: A2←A1; A3←A2; A4←A1; A5←A2/A3.

---

## Plantillas CU (títulos)

1. `feat(backend): asymmetric service area pickup 8 km dropoff 50 km`  
2. `fix(backend): reject driver address outside pickup area geocode`  
3. `feat(backend): villa dolores nucleo localities allowlist for onboarding`  
4. `fix(mobile-passengers): tyc copy pickup nucleo and dropoff 50 km`  
5. `fix(mobile): driver onboarding copy for vd nucleo localities`  

---

## Criollo

**LOCK D:** pedís **cerca de Dolores** (8 km: casco + SP/VS/Piedra Pintada…).  
**Podés irte** hasta ~50 km (Rosas, Valle…).  
**No** pedís *desde* Rosas.  
Conductores viven en el núcleo; el GPS del domicilio manda, no el texto.  
Código: primero fence asimétrico, después candado anti-trampa, después lista de parajes.
