# feat(backend): rank match candidates by ETA not only haversine

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
Scope: **`apps/backend` only** (matching + tests). **No** mobile UI, **no** fare rewrite, **no** batch multi-offer.  
Base: `origin/main` tip **`1af2762a`** (#565) — al arrancar:

```bash
cd /home/marti/Documentos/LIfty/software-lifty
git fetch origin main && git rev-parse origin/main
# tip fresco; no partir de fix/driver-accept-unavailable-ux ni main sucio
```

Branch: `feat/match-rank-by-eta`  
ClickUp: https://app.clickup.com/t/1dfc7p9xc0r  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Pack lock (matching gaps 1:1:1)

| Pack | CU | Scope | Este PR |
|------|-----|--------|---------|
| A busy exclude | `1dfc7p9xc0q` | `#564` MERGED tip `8f1cb056+` | **NO** reabrir |
| **B (este)** | `1dfc7p9xc0r` | Rank por ETA / OSRM al pickup | **sí** |
| D hygiene | `1dfc7p9xc0t` | offered history + TTL + stale claim-spec | **NO** |
| C batch multi-offer | `1dfc7p9xc16` | `trip_offers` / N parallel | **NO** |
| Accept UX lost-offer | `1dfc7p9xca3` | `#565` MERGED | **NO** |
| Expirer accept race | — | `#562` | **NO** |

Pitfalls: `lifty-dev-pitfalls` → `references/passenger-matching-exclusive-serial-vs-uber.md`  
SoT live matching: exclusive serial 1-a-1 (`matchAndBroadcast` → nearest **one** → `offered` ~20s → accept/reject/expire → rematch). **No** inventar multi-offer.

## Síntoma (producto)

Matching elige al conductor **más cercano en línea recta** (Haversine). Eso puede ser peor en tiempo real (río, desvío, calle cortada): el pax espera más aunque haya otro driver un poco más lejos en km pero más rápido en ruta.

Repro conceptual:
1. Driver A ~1.2 km recto / ~12 min de ruta al pickup.
2. Driver B ~1.8 km recto / ~4 min de ruta.
3. Actual tip: oferta a **A** (sort distance).
4. Esperado: oferta a **B** (mejor ETA al origin).

HARD STOP EAS. Backend only.

## Root cause (CONFIRMADO tip `1af2762a`)

`apps/backend/src/features/passenger-trips/matching.service.ts` → `findNearbyDrivers`:

```ts
return rows
  .map(...)
  .filter((d) => d.distance <= radiusKm && vehicleTypesCompatible(...))
  .sort((a, b) => a.distance - b.distance)
  .slice(0, 5);
```

`matchAndBroadcast` ofrece **solo** `nearby[0]`. No hay llamada a OSRM/directions driver→pickup.

Ya existe stack de ruta reutilizable (no reinventar HTTP):

| Pieza | Path |
|-------|------|
| OSRM `directions` / `distanceMatrix` | `apps/backend/src/shared/lib/geo.ts` (`distanceMatrix` → `duration_minutes`; en fail soft → haversine × 3 min/km) |
| Maps service wrapper | `apps/backend/src/features/maps/service.ts` (fareEstimate ya usa matrix) |
| Haversine | mismo `geo.ts` / `shared/lib/geo` |
| Busy filter (A) | `ACTIVE_TRIP_STATUSES` import desde `cleanup` + `busyIds` en `findNearbyDrivers` — **dejar intacto** |

En `NODE_ENV=test`, `directions` devuelve mock fijo (12 min) — los tests de ranking **no** deben depender de OSRM live; mockear `distanceMatrix`/`directions` o inyectar ETA.

## DESIGN LOCK

1. **Modelo de oferta intacto:** exclusive serial; un solo `driver_id` en `trips`; TTL 20s; rematch con `excludeDriverIds`. Cero `trip_offers`.
2. **Pipeline:**
   - Igual que hoy: SQL + filtros + Haversine ≤ radius → candidatos.
   - Cap **K** (hoy 5; OK mantener 5 o documentar 8 max) por distancia recta.
   - Para cada candidato del cap: ETA driver GPS → **trip origin** vía `distanceMatrix` (o `directions` sin steps si alcanza).
   - Sort: **`etaMinutes` ASC**, tie-break **`distance` ASC** (haversine ya calculado).
   - `matchAndBroadcast` sigue tomando `[0]` post-sort.
3. **Fail soft por fila:** si OSRM/matrix falla para un driver, **no** tumbar el match entero. Fallback documentado:
   - Preferir ETA proxy ya usado en geo: `max(1, round(distance_km * 3))` minutos, **o**
   - Empujar al final del sort con `etaMinutes = +Infinity` y tie-break distance — elegir **una** y testearla. Recomendado: **proxy haversine×3** (misma fórmula que `directions` catch) para no perder candidatos en lab sin OSRM.
4. **Concurrencia:** `Promise.all` sobre el cap K (≤5–8). Timeout ya vive en fetch OSRM; no inventar matrix global N×N.
5. **Cache:** `directions` ya cachea Redis 300s por par coords — reutilizar, no duplicar cache keys.
6. **Logging:** un log info compacto en match (tripId corto, ordered `driverId:eta:dist`) ayuda smoke; no spamear PII.
7. **Tipado `NearbyDriver`:** agregar `etaMinutes: number` (y opcional `routeDistanceKm`) para tests/assert; no hace falta exponer al push payload salvo que ya fluya algo similar (default: **no** cambiar body push).
8. **No** cambiar radius 8 km, vehicle class, busy exclude, dual-role ban, offer push sound, expirer.
9. **No** mobile ConnectingDriver ETA UI (follow-up).
10. **No** tocar fare engine / `resolveRouteDistance` trip create salvo import shared.

## Archivos clave

| Path | Rol |
|------|-----|
| `apps/backend/src/features/passenger-trips/matching.service.ts` | `findNearbyDrivers` enrich+sort; keep `matchAndBroadcast` offer `[0]` |
| `apps/backend/src/shared/lib/geo.ts` | `distanceMatrix` / `directions` — **import**, no copiar OSRM URL |
| `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` | tests match/offer existentes + **nuevos** ranking |
| `apps/backend/src/shared/lib/cleanup.ts` | solo lectura busy statuses — no regress A |

Opcional (solo si el mock queda feo inline): helper test-local `rankCandidatesByEta` puro exportado para unit sin DB — KISS preferido: mock module + integration en passenger-trips.test.

## Plan de implementación (mínimo)

1. `git fetch` + branch desde `origin/main` tip actual.
2. Leer `findNearbyDrivers` completo + tests match existentes + `distanceMatrix`.
3. Después del filter haversine, **antes** del sort final:
   - `slice` top K por distance (si querés pre-cap antes de OSRM: sort distance → slice(0,K) → enrich → re-sort ETA).
   - Enrich paralelo con `distanceMatrix(driverLat, driverLng, originLat, originLng)`.
   - Sort eta + distance tie-break.
4. Tests:
   - **Orden:** dos drivers en radio; mock matrix devuelve ETA invertida vs distance → winner = mejor ETA.
   - **Fallback:** matrix throw/reject en uno → sigue en lista con proxy; match no vacía pool.
   - **Regress A:** busy driver sigue excluido (no re-ofrecer).
   - **Regress offer:** sigue 1 offer, status `offered`, push channel si ya hay test.
5. No cambiar mobile. No EAS.

## Criterios de aceptación

- [ ] Candidatos dentro del radio se ordenan por **ETA al origin** (primario) y haversine (desempate).
- [ ] `matchAndBroadcast` ofrece el **mejor ETA** post-enrich, no el más cercano recto si difieren.
- [ ] Fallo OSRM por candidato = fail soft (proxy o documentado); el match no revienta 500.
- [ ] Busy exclude (#564) + vehicle class + dual-role self-ban intactos.
- [ ] Exclusive serial intacto (1 offer viva; no batch).
- [ ] Tests nuevos verdes + suite passenger-trips / matching relevante verde.
- [ ] PR body: root cause 3–5 líneas + cómo se mockea ETA en test + “no C/D”.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
export PATH="$HOME/.bun/bin:$PATH"
bun --filter @lifty/backend test
# o scoped:
bun --filter @lifty/backend test src/features/passenger-trips/passenger-trips.test.ts
bun run typecheck
bun run lint
```

Si test needs DB/Redis como CI: respetar el harness existente del package (no inventar docker compose nuevo).

## Entrega

1. Branch `feat/match-rank-by-eta` desde `origin/main` tip fresco.
2. Conventional commit subject-case (commitlint):  
   bueno: `feat(backend): rank match candidates by eta not haversine only`  
   malo: `feat(backend): Rank Match Candidates…` / `ETA Rank`
3. **No** `git add -A` — solo matching + tests (+ handoff si querés en el mismo PR o dejarlo out).
4. `gh auth switch --user martiyaquinta`
5. PR → `main` con link ClickUp `https://app.clickup.com/t/1dfc7p9xc0r`
6. Post-create: `gh pr comment <N> --body '/review'`
7. Comment en CU: PR URL + SHA + “pack B only”.
8. **Complete CU solo post-merge** a main.
9. HARD STOP: EAS, mobile apps, pack C/D, accept UX, TyC, admin.

## Anti-scope (rechazar en review)

- Tabla `trip_offers` / fan-out N drivers
- Cambiar `OFFER_TIMEOUT_MS` 20→12 (eso es D)
- Spec rewrite claim-multi (D)
- Mostrar ETA en UI pax/driver
- Reabrir busy filter “a mano” distinto de `ACTIVE_TRIP_STATUSES`
- Google Distance Matrix API de pago — usar OSRM/`distanceMatrix` del monorepo
- Edge Functions / Railway references

## Kickoff corto (humano → peer)

```
Leé y ejecutá SOLO:
/home/marti/Documentos/LIfty/software-lifty/docs/handoffs/PROMPT-feat-match-rank-by-eta.md

CU https://app.clickup.com/t/1dfc7p9xc0r
Branch feat/match-rank-by-eta desde origin/main tip 1af2762a+
Pack B only: ETA rank en findNearbyDrivers via distanceMatrix.
A busy #564 y accept UX #565 ya merged — no reabrir.
No batch C, no hygiene D, no mobile, HARD STOP EAS.
gh martiyaquinta · /review post-PR · complete CU solo post-merge.
```
