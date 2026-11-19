# fix(backend): exclude busy drivers from match pool

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
Scope: **`apps/backend` only**  
Base: `origin/main` tip **`4e688a83`** (#563) — al arrancar:

```bash
cd /home/marti/Documentos/LIfty/software-lifty
git fetch origin main && git rev-parse origin/main
# tip fresco; no partir de branch EAS ni main sucio
```

Branch: `fix/match-exclude-busy-drivers`  
ClickUp: https://app.clickup.com/t/1dfc7p9xc0q (Backlog → claim; opcional mover a Ahora al arrancar)  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Pack lock (matching gaps 1:1:1)

| Pack | CU | Scope | Este PR |
|------|-----|--------|---------|
| **A (este)** | `1dfc7p9xc0q` | Exclude busy drivers en `findNearbyDrivers` | **sí** |
| B | `1dfc7p9xc0r` | Rank por ETA / OSRM | **NO** |
| D | `1dfc7p9xc0t` | Offer hygiene / TTL / stale claim-spec | **NO** |
| C batch multi-offer | no CU | `trip_offers` redesign | **NO** — no crear |
| #562 expirer accept race | merged | no reabrir | **NO** |

Pitfalls: `lifty-dev-pitfalls` → `passenger-matching-exclusive-serial-vs-uber.md` (+ `offer-expirer-accept-race.md` solo lectura).

## Síntoma

Matching Lifty = **exclusive serial** 1-a-1 (`matchAndBroadcast` → nearest only → `offered` ~20s → accept / reject / expire → rematch).

Un conductor **online** (o grace heartbeat) con viaje vivo (`accepted` / `en_route` / `waiting` / `in_trip` / `offered` a otro pax…) **sigue entrando al pool** y puede recibir otra `trip:request`. Impacto: oferta fantasma, reject/timeout ruidoso, peor experiencia pax, cascada gasta TTL en drivers que no pueden aceptar bien.

HARD STOP EAS / mobile UI — backend only.

## Root cause (CONFIRMADO tip `4e688a83`)

`apps/backend/src/features/passenger-trips/matching.service.ts` → `findNearbyDrivers`:

Filtros actuales:

- `drivers.status = approved`
- GPS row fresca ≤ 5 min
- online **o** `last_heartbeat` dentro de `DRIVER_OFFLINE_GRACE_MS` (import desde cleanup)
- vehicle class fail-closed
- `excludeDriverIds` + blocked + dual-role self (`drivers.user_id ≠ passengerUserId`)
- haversine ≤ 8 km, sort distance, top 5 — offer only `[0]`

**No** hay filtro por trip activo del driver.

Mientras tanto `apps/backend/src/shared/lib/cleanup.ts` **sí** conoce busy para no marcar offline:

```ts
const ACTIVE_TRIP_STATUSES = [
  'offered',
  'request_received',
  'accepted',
  'en_route',
  'waiting',
  'in_trip',
] as const;
// select trips.driver_id where status in ACTIVE_TRIP_STATUSES → notInArray offline flip
```

Ese set está **privado** al módulo cleanup — matching no lo importa. Hay otros sets cercanos (`account-deletion/policy.ts` `ACTIVE_TRIP_STATUSES`, admin `IN_PROGRESS_TRIP_STATUSES`) — **no** inventar un cuarto divergente sin alinear.

`matchAndBroadcast` solo llama `findNearbyDrivers` → fix ahí cubre primer match + rematch (`releaseAndRematch` pasa `excludeDriverIds` del último, pero no busy globales).

## DESIGN LOCK

1. **Busy set SoT para matching = mismo espíritu cleanup**  
   Exportar `ACTIVE_TRIP_STATUSES` (o `DRIVER_BUSY_TRIP_STATUSES`) desde `cleanup.ts` **o** helper shared mínimo (`shared/lib/trip-active-statuses.ts`) usado por cleanup + matching. Prefer **export desde cleanup** si el diff es chico; si cleanup import circular, extraer shared file.
2. Incluir **`offered`**: driver con oferta exclusiva viva de trip X no debe recibir oferta de trip Y.
3. Incluir `request_received` si sigue en enum/DB (legacy cleanup lo lista).
4. **No** excluir solo por `is_online=false` — el bug es online+busy.
5. Implementación SQL preferida:
   - subquery / `notInArray(drivers.id, busyDriverIds)` **o**
   - `NOT EXISTS (select 1 from trips where driver_id = drivers.id and status in (...))` en el `where`  
   Documentar en PR cuál eligieron y por qué (perf KISS OK a escala lab).
6. `driver_id` null en trips no cuenta.
7. Sin cambio push payload, realtime contract, TTL 20s, radius 8 km, top-5 slice.
8. Logs `[MATCH]` siguen con `driverId` + `distanceKm` cuando asigna.

## Scope

**IN**

1. Shared busy statuses (export/reuse cleanup list).
2. `findNearbyDrivers` excluye drivers con ≥1 trip en busy statuses.
3. Tests en `passenger-trips.test.ts` (o matching test file si existe):
   - nearby free approved online → still matchable
   - nearby approved online **with** `in_trip`/`en_route`/`accepted`/`offered` other trip → **not** in candidates / `matchAndBroadcast` picks other or 0
4. Rematch path: busy exclude still applies when `excludeDriverIds` has prior reject.
5. PR description: set exacto + link CU + note packs B/C/D out.

**OUT**

- ETA ranking (B)
- Multi-offer / `trip_offers` (C)
- Hygiene offered-history (D)
- Mobile IncomingRequest / ringtone
- Cambiar `OFFER_TIMEOUT_MS` / search 120s
- Legacy driver-owned `createTrip` matching (salvo reuso accidental del helper — no expandir)
- EAS, apps mobile, admin, secrets
- Reescribir claim-spec 2026-08-12 (stale — D)

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/backend/src/features/passenger-trips/matching.service.ts` | `findNearbyDrivers` |
| `apps/backend/src/shared/lib/cleanup.ts` | `ACTIVE_TRIP_STATUSES` privado hoy — export/share |
| `apps/backend/src/features/passenger-trips/service.ts` | `releaseAndRematch` / `requestTrip` callers (solo verificar) |
| `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` | tests match (~L584 push test anchor) |
| `apps/backend/src/features/account-deletion/policy.ts` | referencia set similar — no divergir sin nota |
| `apps/backend/src/features/trips/service.ts` | expirer #562 — no tocar salvo import accidental |

## Sketch (orientativo)

```ts
// cleanup.ts (or shared)
export const ACTIVE_TRIP_STATUSES = [
  'offered',
  'request_received',
  'accepted',
  'en_route',
  'waiting',
  'in_trip',
] as const;

// matching.service.ts findNearbyDrivers — after building base conditions:
const busyRows = await db
  .selectDistinct({ driverId: trips.driver_id })
  .from(trips)
  .where(
    and(
      isNotNull(trips.driver_id),
      inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
    ),
  );
const busyIds = busyRows.map((r) => r.driverId).filter((id): id is string => !!id);
if (busyIds.length > 0) {
  conditions.push(notInArray(drivers.id, busyIds));
}
// merge with existing excluded (blocked + excludeDriverIds) — dedupe
```

Alternativa single-query `NOT EXISTS` preferible si querés 1 round-trip — OK.

## Criterios de aceptación

- [ ] `findNearbyDrivers` no devuelve driver con trip en `ACTIVE_TRIP_STATUSES` (set documentado = cleanup).
- [ ] Driver solo `offered` en otro trip tampoco entra.
- [ ] Driver free nearby + vehicle OK sigue matcheando (regresión).
- [ ] Primer match y rematch usan el mismo exclude.
- [ ] Tests BE verdes (busy vs free).
- [ ] Sin cambio contrato push/realtime.
- [ ] 1 branch = 1 PR backend; no B/C/D.
- [ ] HARD STOP EAS / no mobile drive-by.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
git fetch origin main
git checkout -B fix/match-exclude-busy-drivers origin/main
# … implement …

bun --filter @lifty/backend test passenger-trips
# o: cd apps/backend && bun test src/features/passenger-trips/passenger-trips.test.ts
bun --filter @lifty/backend exec tsc --noEmit
bunx biome check apps/backend/src/features/passenger-trips/matching.service.ts apps/backend/src/shared/lib/cleanup.ts
```

Smoke lab (opcional post-merge VPS): driver A in_trip + pax request cerca → A no recibe offer; driver B free sí.

## Entrega

1. Commit conventional subject-case:  
   `fix(backend): exclude busy drivers from passenger match pool`
2. **No** `git add -A` — solo matching/cleanup/tests (+ este handoff si va en la branch).
3. PR → `main`: root cause 3–5 líneas + set statuses + test plan + CU link + “packs B/C/D out”.
4. `gh pr comment <N> --body '/review'`
5. Comment ClickUp con PR URL + branch.
6. **Complete CU solo post-merge** (comment SHA). Opcional: mover a Ahora al claim; no complete pre-merge.
7. No secrets.

## Anti-scope siblings

- `1dfc7p9xc0r` ETA rank  
- `1dfc7p9xc0t` hygiene  
- `1dfc7p9xc16` batch multi-driver (si aparece — out)  
- TyC borrador `1dfc7p9x9ew` — **HOLD abogado**  
- Geo/meters CUs stale merged (#558–#561)  
- Didit sandbox `1dfc7p9wg8a` (Nobel)

## Kickoff one-liner (peer agent)

```
Ejecutá docs/handoffs/PROMPT-fix-match-exclude-busy-drivers.md
CU https://app.clickup.com/t/1dfc7p9xc0q
Branch fix/match-exclude-busy-drivers desde origin/main tip fresco;
export/reuse ACTIVE_TRIP_STATUSES de cleanup; findNearbyDrivers excluye busy;
tests passenger-trips busy vs free; backend only; no ETA/batch/EAS;
gh martiyaquinta; complete CU solo post-merge.
```
