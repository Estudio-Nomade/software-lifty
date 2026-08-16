# PROMPT — Auditoría + reparación de flujos de solicitud de viaje

**Para:** agente ejecutor (fresh context). No heredes historial.
**De:** orquestador del proyecto Lifty
**Idioma:** español
**Fecha del inventario:** 2026-08-15
**Repo:** `/home/marti/Documentos/LIfty/software-lifty`
**Branch:** nunca pushear a `main`. Todo por PR. Conventional Commits.

---

## Quién sos y qué tenés que hacer

Sos el agente ejecutor de una auditoría de flujos **pasajero ↔ conductor ↔ backend**. Tu trabajo tiene **dos fases obligatorias** y no podés saltearte la primera:

1. **AUDITORÍA** — verificar el inventario de abajo contra el código actual, completar findings, escribir el reporte.
2. **REPARACIÓN** — resolver bugs P0/P1 en orden, con BMAD + subagentes, tests, lint, typecheck.

No implementes features nuevas de backlog (SOS UI, pago MP, favoritos sync, trip detail) salvo que un P0 lo exija. El objetivo es: **el happy path de solicitar → matchear → aceptar → viajar → completar → calificar funciona de punta a punta, y los caminos de error (reject / timeout / no drivers / cancel) no dejan viajes zombies ni UIs trabadas.**

---

## Skills BMAD que DEBÉS invocar (fresh context, en este orden)

Antes de tocar código:

1. `bmad-help` — confirmar fase 4-implementation.
2. `bmad-review-adversarial-general` — sobre los 3 árboles de código (backend trips, mobile driver, mobile-passengers).
3. `bmad-review-edge-case-hunter` — sobre la state machine de trips + matching.

Para cada bug que vayas a arreglar:

4. `systematic-debugging` — antes de proponer el fix.
5. `bmad-quick-dev` (QQ) — para el fix puntual. Si el cambio es grande o cruza contratos, usá `bmad-create-story` + `bmad-dev-story` en vez de QQ.
6. `bmad-code-review` (CR) — después de cada paquete de fixes, antes de dar por cerrado.
7. `verification-before-completion` — antes de afirmar que algo funciona.
8. `test-driven-development` — tests primero cuando agregues comportamiento.

Subagentes (`Task` explore / general):
- Explorá en paralelo (backend / driver / passenger) si el inventario de abajo está desactualizado.
- Un subagente por dominio de bug independiente. No dos agentes editando el mismo archivo.
- Cada prompt de subagente: scope 1, self-contained, output esperado explícito, constraints (no refactor de más).

Leé y respetá:
- `AGENTS.md` (root)
- `apps/backend/AGENTS.md`
- `apps/mobile/AGENTS.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/spec-active-trip-lifecycle.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `specs/spec-passenger-app/FLOWS.md` (útil como mapa, **desactualizado** en endpoints)
- `docs/superpowers/specs/2026-08-12-passenger-ride-matching-design.md`
- `docs/superpowers/specs/2026-08-11-passenger-ride-completion-design.md`

---

## Restricciones del proyecto (no negociables)

- Lifty está en **desarrollo activo**. NO hay prod, NO hay MVP deploy, NO hay CD. No intentes deploy.
- Backend: `localhost`. Mobile: Expo Go.
- `main` protegido. Branch + PR.
- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`). Lefthook corre biome + commitlint.
- No commitees a menos que el humano lo pida.
- No secretos en el repo.
- No comentarios en código salvo que te los pidan.
- Verificar con `bun run lint`, `bun run typecheck`, y tests del paquete tocado (`bun --filter @lifty/backend test`, tests mobile/passenger del área).
- Theme mobile: siempre `theme.colors.*`. Named exports. No `@react-navigation/*`.

Apps:
- Driver: `apps/mobile`
- Passenger: `apps/mobile-passengers`
- Backend: `apps/backend` — Elysia, rutas montadas en `/api`

---

## Mapa de flujos REALES (inventario 2026-08-15)

Usá esto como hipótesis. **Verificá contra el código** antes de fiarte. Si el código cambió, actualizá el reporte.

### Happy path implementado (backend)

```
Passenger POST /api/passenger/trips/request
  → trip pending, driver_id null
  → setImmediate matchAndBroadcast
      → findNearbyDrivers (online, GPS, ≤5km, sort, slice 5, USA SOLO nearby[0])
      → 0 drivers: trip queda pending. SIN evento al pasajero. Debe retry.
      → else: pending → offered, driver_id = nearest, expires_at = +20s
      → broadcast trip:request on driver:{id} + FCM

Driver POST /api/trips/:id/accept   (NO /claim — claim exige driver_id null → 409 post-match)
  → offered → accepted + verification_code 4 dígitos
  → FCM trip:verification al pasajero
  → broadcast trip:status on passenger:{id}   [accept sí; respond(accept) NO]

Driver POST /en-route → /arrived (GPS ≤50m origin) → /start {code} → /complete (GPS ≤50m dest)
  → cada paso broadcast trip:status al pasajero

Passenger o driver POST …/rate   (el PRIMERO pone completed → rated; el segundo 400)
Driver PUT /collect {cash|transfer}
```

### State machine canónica (`VALID_TRANSITIONS` en `apps/backend/src/features/trips/service.ts`)

```
pending           → offered
offered           → accepted | rejected | expired
request_received  → accepted | rejected | cancelled   ← path legacy driver POST /trips
accepted          → en_route | cancelled
en_route          → waiting  | cancelled
waiting           → in_trip                            ← cancel NO permitido
in_trip           → completed                          ← cancel NO permitido
completed         → rated
```

Hay DOS mundos: matching pasajero (`pending/offered`) y createTrip driver (`request_received`). No los mezcles.

### Canales realtime

| Topic | Event | Cuándo |
|---|---|---|
| `driver:{driverId}` | `trip:request` | offer / match |
| `driver:{driverId}` | `trip:cancelled` | passenger cancel |
| `passenger:{passengerId}` | `trip:status` | accept/claim/en-route/arrived/start/complete/cancels. **NO** en offer/reject/expire/no-drivers |
| `trip:{tripId}` | `driver:location` | WS location del driver **si** hay trip activo |
| `trip:{tripId}` | `message:sent` | chat |

### Driver app (`apps/mobile`) — lo que realmente hace

```
Online ──toggle on──► Active  (ÚNICO lugar con WS location + heartbeat + subscribe trip:request)
                         │
         trip:request / poll 5s / push / resume
                         ▼
                  IncomingRequest  (payload del broadcast se DESCARTA; re-fetch /trips/active)
                   │ accept        │ reject (fuerza OFFLINE)   │ timeout 20s (sigue online)
                   ▼               ▼                           ▼
              Navigation      Online                      Online
              auto /en-route
                   │ LLEGUE (<50m)     │ Cancel
                   ▼                   ▼
            WaitingPassenger        Online
            [chat + modal 4 dígitos]
                   │ POST /start
                   ▼
            TripInProgress   ← SIN listener de cancel pasajero, SIN SOS
                   │ POST /complete
                   ▼
            TripComplete (collect + rate)
                   ▼
                 Online
```

### Passenger app (`apps/mobile-passengers`) — lo que realmente hace

```
Home overlay (Desde/Hacia + autocomplete)
  → VehicleSelect (precios MOCK $3500/$2100; request REAL)
    → POST /passenger/trips/request {origin_lat, dest_lat, vehicle_type auto|moto, distance_km, duration_minutes}
      → ConnectingDriver (30s + realtime trip:status)
        → accepted|en_route|waiting|in_trip → TripInProgress
            ← DEAD END. No navega a TripComplete.
            ← ignora trip:status salvo cancelled.
            ← no marker del driver, no tracking live.
TripComplete existe pero es MOCK (Juan Pérez) y NADIE navega ahí.
rateRide existe y NO se llama.
retryRide después de offered → 400 (backend exige pending).
```

---

## Findings pre-cargados (verificar + clasificar + ampliar)

Estos ya fueron encontrados. Confirmá cada uno con evidencia `file:line`. Agregá los que falten. No inventes.

### P0 — rompen el funnel de solicitud / dejan el viaje inutilizable

1. **Matching one-shot.** `findNearbyDrivers` trae 5, `matchAndBroadcast` ofrece solo al `[0]`. Reject / expire / no-drivers **no rematchean**. Trip queda `rejected`/`expired`/`pending` y el pasajero no se entera (no hay `broadcastToPassenger` en esos casos). `retryTrip` solo funciona en `pending` → después de offered/expired es 400.
   - `apps/backend/src/features/passenger-trips/matching.service.ts`
   - `apps/backend/src/features/trips/service.ts` (`rejectTrip`, `expireStaleOffers`)
   - `apps/backend/src/features/passenger-trips/service.ts` (`retryTrip`)

2. **Pasajero trabado post-claim.** `TripInProgressScreen` no actualiza status en `en_route`/`waiting`/`in_trip`/`completed`. Nunca navega a complete/rating. El viaje termina en el driver y el pasajero se queda en “Conductor asignado”.
   - `apps/mobile-passengers/src/screens/TripInProgressScreen.tsx`

3. **Location uplink del driver muere al salir de Active.** `useLocationWS` + heartbeat solo en `ActiveScreen`. Durante Navigation / Waiting / InProgress el WS se cierra. El pasajero no puede trackear. Matching/cleanup pueden marcar offline. `broadcastTripLocation` nunca corre mid-trip.
   - `apps/mobile/src/hooks/useLocationWS.ts`
   - `apps/mobile/src/screens/ActiveScreen.tsx`
   - `apps/backend/src/features/location/routes.ts`

4. **`claim` vs `accept` divergentes.** Matching setea `driver_id` en offer → `POST /trips/:id/claim` da 409. El path real es `/accept`. Specs y comentarios hablan de claim. `respondToTrip(accept)` no hace `broadcastToPassenger`.

5. **ConnectingDriver retry roto.** Tras matching el trip es `offered`. Retry exige `pending`. El botón Retry del timeout de 30s es no-op/400. Además el timeout UI es 30s y el offer backend es 20s.

### P1 — bugs reales, happy path degradado o caminos de error rotos

6. **Rating mutuo imposible.** Ambos endpoints exigen `completed` y flippean a `rated`. El segundo rater recibe 400. Sprint ai-12 abierto.
7. **`cancelled_early` / `cancelled_late` dead.** `transitionTrip` remapea y después `VALID_TRANSITIONS.waiting` no los incluye. Tests **afirman el 400**. Driver no puede cancelar en waiting/in_trip. WaitingPassenger timer 300s es cosmética (no no-show).
8. **IncomingRequest descarta el payload** de `trip:request` y re-fetch. Race: navega antes de que `/trips/active` vea el offer.
9. **Reject manual fuerza offline**; timeout reject deja online. Inconsistente. Timeout no lee `expires_at`.
10. **TabBar del driver siempre visible** sobre incoming/nav/waiting/in-trip. Puede abandonar el viaje por tabs.
11. **Verification code leak.** El DTO de `/trips/active` trae el código. `PassengerCodeScreen` (DEV) lo muestra. El driver puede start sin pedirlo al pasajero.
12. **`cleanup.ts` statuses stale.** Trata `driver_arrived`/`in_progress` (nunca escritos) y omite `en_route`/`waiting`/`in_trip` → drivers en viaje pueden marcarse offline a los 60s sin heartbeat (empeorado por P0 #3).
13. **`TripStatus` passenger omite `in_trip`.** Type hole + UI sin copy para in_trip.
14. **Call passenger/driver es no-op** en passenger (`onPress={() => {}}`).
15. **Fare mock** en VehicleSelect; `estimateFare` existe y no se llama. No es P0 del matching spec (non-goal), no lo priorices.

### P2 — deuda / mocks / cobertura

16. `TripCompleteScreen` passenger: Juan Pérez, $3500, nadie navega.
17. `TripRequestScreen` passenger: orphan mock, no linkeado.
18. SOS UI ausente en ambas apps. Backend `POST /api/sos` listo. Backlog (ai-5) — **no implementar** en esta pasada salvo que te sobre tiempo después de P0/P1.
19. Chat driver/passenger: wired. No tocar.
20. Tests driver: solo `incoming-request.test.tsx`. Passenger: ConnectingDriver + TripInProgress parcial. Backend: no tests de claim/respond/webhook/`expireStaleOffers`.
21. `requireRole` definido, no usado. Dual-role es intencional (PR #254) — no lo “arregles” bloqueando passenger trips a drivers.
22. `broadcastTripCancelled` exportado, never called (passenger cancel inlinea el HTTP).
23. Matching no filtra: driver ya en viaje activo, `vehicle_type`, district, KYC/`drivers.status==='approved'`.

### NO es bug (no “fixes” de esto)

- Pickup/dest dedicados colapsados en overlay de Home — decisión de implementación, epic 4 marked done.
- DriverFound / Verification como pantallas dedicadas — merged into TripInProgress, aceptable si el estado se actualiza.
- Precios mock en VehicleSelect — non-goal del matching spec.
- Favoritos solo local — ai-10 backlog.
- History detail — 7-2 backlog.
- Payment cash/MP — 6-3 backlog.

---

## Entregable 1 — Auditoría (obligatorio, ANTES de code)

Escribí:

`_bmad-output/implementation-artifacts/AUDIT-flujos-viaje.md`

Estructura:

```markdown
# Auditoría flujos de viaje Lifty
## Método (AR + ECH, evidencia file:line)
## Mapa verificado (actualizar si el inventario está stale)
## State machine real vs esperada
## Matriz de flujos

| Flujo | Backend | Driver | Passenger | ¿E2E? | Evidencia |
| solicitar viaje | | | | | |
| matching nearest | | | | | |
| offer realtime + push | | | | | |
| accept | | | | | |
| reject | | | | | |
| expire 20s | | | | | |
| no drivers | | | | | |
| rematch / retry | | | | | |
| en-route | | | | | |
| arrived + geofence | | | | | |
| verification start | | | | | |
| in-trip + location | | | | | |
| complete | | | | | |
| rate passenger→driver | | | | | |
| rate driver→passenger | | | | | |
| cancel passenger (search / accepted / waiting) | | | | | |
| cancel driver | | | | | |
| chat | | | | | |
| SOS | | | | | |
| resume after kill | | | | | |

## Findings
### P0
### P1
### P2
Cada finding: título, evidencia file:line, impacto, repro, fix propuesto, riesgo del fix.

## Fuera de alcance (backlog)
## Orden de reparación (DAG)
```

Corré adversarial review + edge-case hunter sobre este doc. Si no hay ≥10 findings, re-analizá (la skill AR lo exige).

---

## Entregable 2 — Reparación (después de la auditoría)

Trabajá en branch `fix/trip-flow-audit` desde `main` actualizado.

### Orden (DAG). No saltees. Un paquete = un commit lógico ( commiteá solo si te lo piden ).

**Paquete A — Matching no deja zombies (backend)**  
Objetivo: reject / expire / 0 drivers continúan o cierran el funnel con señal al pasajero.

Comportamiento esperado (confirmar contra `spec-active-trip-lifecycle.md`; si contradice, documentá la decisión en el audit y seguí esta regla):

- 0 drivers: `broadcastToPassenger` con status `pending` + flag/drivers_found=0 **o** evento explícito. ConnectingDriver ya tiene timeout 30s; el evento evita espera ciega.
- reject o expire del driver ofertado: **liberar `driver_id`**, volver a `pending`, rematch al siguiente nearby (excluir el que rechazó / el que dejó expirar). Si no queda nadie → pending + notify, no `rejected` terminal en el primer no.
- `retryTrip`: permitir retry desde `pending` **y** desde `expired` (reabrir a pending + match). No desde `accepted+`.
- `broadcastToPassenger` también en reject/expire/rematch.
- Tests: matching 0 drivers; reject → next driver; expire → rematch; retry desde expired; no rematch si ya accepted.

**Paquete B — Location WS vive todo el viaje (driver)**  
`useLocationWS` + heartbeat activos en IncomingRequest, Navigation, WaitingPassenger, TripInProgress (no solo Active). Al completar/cancelar, cortar. Verificar que el backend broadcast `driver:location` en `trip:{id}` para accepted/en_route/waiting/in_trip.

**Paquete C — Passenger sigue el lifecycle (passenger)**  
`TripInProgressScreen`:

- suscribir `trip:status` y actualizar `rideStore` + UI por status (`accepted`, `en_route`, `waiting`, `in_trip`, `completed`, cancelled*).
- `completed` → `replace('TripComplete')` con data real (no Juan Pérez).
- `TripCompleteScreen`: data del trip + llamar `rateRide`. Skip rating permitido.
- Agregar `in_trip` a `TripStatus`.
- ConnectingDriver: si status `expired`/`rejected` o 0 drivers, mostrar empty + retry que funcione (paquete A). No tragar 400.

**Paquete D — Contratos accept/claim + notify**  
- Documentar en audit: path oficial post-match es `/accept`, no `/claim`.
- `respondToTrip('accept')` debe `broadcastToPassenger` igual que `acceptTrip`.
- IncomingRequest: usar payload de `trip:request` si llega (id + addresses) y no depender solo del poll.
- No fuerces offline en reject manual (dejar online, volver a Active). Timeout y reject deben ser simétricos.

**Paquete E — Cancel / waiting (solo si A–D verdes y hay tiempo)**  
Decidir con evidencia: ¿el driver puede cancelar en `waiting` (no-show a los 5 min)? Si sí, arreglar `VALID_TRANSITIONS` + UI del timer. Si no, sacar copy que miente. No dejes la inconsistencia.

**No hacer en esta pasada:** SOS UI, payment, favorites backend, trip detail, tab bar redesign completo, MercadoPago, live marker fancy (sí: al menos actualizar centro/status; marker si es barato en `PassengerMap`).

### Subagentes sugeridos (paralelo solo si no comparten files)

Después de escribir el audit, podés despachar:

- Agent BE: Paquete A (+ tests `passenger-trips.test.ts` / matching)
- Agent DRV: Paquete B
- Agent PAX: Paquete C

A y C se acoplan por el contrato de eventos (0 drivers / expired). Primero mergeá A, después C. B es independiente → paralelo con A.

Cada subagente devuelve: root cause, files changed, tests run + output, residual risk.

---

## Verificación (obligatoria antes de decir “listo”)

Correr y pegar output real en el audit (sección “Verificación”):

```bash
bun run lint
bun run typecheck
bun --filter @lifty/backend test
# tests del área mobile/passenger que toques
```

Checklist E2E mental (si no podés levantar 2 Expo + backend, dejalo explícito como no-corrido):

1. Pasajero solicita con driver online a <5km → driver ve IncomingRequest.
2. Driver acepta → pasajero sale de ConnectingDriver a InProgress con nombre/auto/código reales.
3. Driver en-route / arrived / start(code) / complete → UI pasajero cambia en cada paso y termina en TripComplete.
4. Pasajero califica → 200.
5. Driver rechaza → se ofrece a otro o pasajero ve “no hay conductores” (no spinner eterno).
6. Timeout 20s offer → igual.
7. 0 drivers → pasajero no espera ciego.
8. Cancel en search y en accepted funciona ambos lados.
9. Mid-trip, `driver:location` se emite (log backend o canal `trip:{id}`).
10. Kill+reopen de ambas apps retoma el trip activo.

---

## Cómo reportar al orquestador

Cuando termines (o si te trabás en un P0), devolvé SOLO:

1. Path del `AUDIT-flujos-viaje.md`
2. Lista P0/P1: fixed / deferred / wontfix (1 línea c/u)
3. Files changed
4. Commands de verificación + resultado
5. Riesgos residuales
6. Qué NO hiciste (backlog)

No resumas el código. No reescribas la arquitectura. No abras PRs ni commitees salvo instrucción explícita del humano.

---

## Arranque (copiá y ejecutá)

1. Invocá las skills BMAD listadas.
2. Verificá el inventario (3 explores en paralelo si hace falta).
3. Escribí `AUDIT-flujos-viaje.md`.
4. Branch `fix/trip-flow-audit`.
5. Paquete A → B ∥ C (C después de A) → D → E opcional.
6. CR + verification-before-completion.
7. Reportá al orquestador.
