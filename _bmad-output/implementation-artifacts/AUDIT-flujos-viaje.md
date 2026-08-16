# Auditoría flujos de viaje Lifty

Fecha: 2026-08-15
Branch base: `main` @ `b2c293f`
Método: `bmad-review-adversarial-general` + `bmad-review-edge-case-hunter` sobre los 3 árboles (backend trips / mobile driver / mobile-passengers). Evidencia `file:line` verificada contra el código.

## Estado del inventario

El inventario del PROMPT (2026-08-15) está **actualizado**. No encontré divergencias materiales entre el mapa de flujos documentado y el código real. Las únicas precisiones:

- `apps/mobile/AGENTS.md` dice Expo SDK 56 / RN 0.85; `apps/mobile-passengers/AGENTS.md` dice SDK 54 / RN 0.81. No afecta esta auditoría.
- El driver **no** usa `/respond` ni `/claim`; usa `/accept` y `/reject` (`IncomingRequestScreen.tsx:193,228`). `respond`/`claim` existen en backend como endpoints legacy/no usados.
- El rating driver→pasajero vive en `features/ratings` (`POST /api/ratings/trips/:trip_id`), no en `features/trips`.

## State machine real vs esperada

`VALID_TRANSITIONS` en `apps/backend/src/features/trips/service.ts:17-26`:

```
pending           → offered
offered           → accepted | rejected | expired
request_received  → accepted | rejected | cancelled
accepted          → en_route | cancelled
en_route          → waiting  | cancelled
waiting           → in_trip
in_trip           → completed
completed         → rated
```

Observaciones críticas (ver Findings):

- `transitionTrip` (`service.ts:114-121`) remapea `cancelled` en `waiting` a `cancelled_early`/`cancelled_late`, pero `waiting` NO los incluye como destino válido → **siempre 400**. El branch `cancelled_early`/`cancelled_late` es dead code.
- `pending`/`offered`/`request_received` no tienen transición a `cancelled` vía `VALID_TRANSITIONS`. El cancel del pasajero (`passenger-trips/service.ts:229`) hace su propio UPDATE directo a `cancelled` sin pasar por la máquina de estados (allowlist propio: `pending|offered|accepted|en_route`).
- Dos mundos coexisten y son intencionales: matching pasajero (`pending/offered`) vs createTrip driver (`request_received`). No mezclar.

## Matriz de flujos

| Flujo | Backend | Driver | Passenger | ¿E2E? | Evidencia |
|---|---|---|---|---|---|
| solicitar viaje | POST /passenger/trips/request → pending | — | VehicleSelect → requestRide | ✅ | `passenger-trips/routes.ts:16`, `passenger.ts:45` |
| matching nearest | findNearbyDrivers (5) → ofrece solo [0] | — | — | ⚠️ one-shot | `matching.service.ts:73` |
| offer realtime + push | broadcastTripRequest + FCM | ActiveScreen subscribe | — | ✅ | `matching.service.ts:104-110`, `ActiveScreen.tsx:126` |
| accept | POST /trips/:id/accept → accepted + code | IncomingRequest | (vía realtime) | ✅ | `service.ts:479`, `IncomingRequestScreen.tsx:193` |
| reject | POST /trips/:id/reject → rejected (terminal) | IncomingRequest | — | ❌ no rematch | `service.ts:521` |
| expire 20s | expireStaleOffers → expired (terminal) | — | — | ❌ no rematch/notify | `service.ts:365-397` |
| no drivers | matchAndBroadcast retorna 0, sin notify | — | ConnectingDriver espera ciego | ❌ | `matching.service.ts:68-71` |
| rematch / retry | retryTrip exige pending | — | retry 400 post-offered | ❌ | `passenger-trips/service.ts:128` |
| en-route | POST /en-route → broadcast | Navigation | (ignora) | ⚠️ | `service.ts:526`, `NavigationScreen.tsx:114` |
| arrived + geofence | POST /arrived (≤50m) → waiting | Navigation | (ignora) | ⚠️ | `service.ts:535-558` |
| verification start | POST /start {code} → in_trip | WaitingPassenger modal | code en UI | ✅ | `service.ts:561` |
| in-trip + location | broadcastTripLocation solo si WS abierto | WS muere fuera de Active | sin tracking | ❌ | `location/routes.ts:91-99`, `useLocationWS.ts` |
| complete | POST /complete (≤50m) → completed | TripInProgress | **no navega** | ❌ | `service.ts:590`, passenger `TripInProgressScreen` |
| rate passenger→driver | POST /passenger/trips/:id/rate | — | rateRide existe, no se llama | ❌ | `passenger-trips/service.ts:318` |
| rate driver→passenger | POST /ratings/trips/:id | TripComplete (no llama) | — | ❌ | `ratings/service.ts:9` |
| cancel passenger | POST /passenger/trips/:id/cancel (allowlist) | — | handleCancel | ⚠️ parcial | `passenger-trips/service.ts:218` |
| cancel driver | POST /trips/:id/cancel → transition | — | (realtime cancel*) | ⚠️ waiting/in_trip 400 | `service.ts:616` |
| chat | mensajes gated por terminal | ChatScreen | ChatScreen | ✅ | `service.ts:814` |
| SOS | POST /api/sos (backend listo) | sin UI | sin UI | ❌ backlog | sprint-status ai-5b |
| resume after kill | AppInitializer / HomeScreen | ActiveTripRecovery | HomeScreen focus | ⚠️ parcial | `AppInitializer.tsx:78`, `HomeScreen.tsx:35` |

## Findings

### P0 — rompen el funnel o dejan viajes zombies

**P0-1. Matching one-shot: reject/expire/0-drivers no rematchean ni notifican al pasajero.**

- Evidencia: `matching.service.ts:73` ofrece solo `nearby[0]`; `matching.service.ts:68-71` (0 drivers) no emite nada al pasajero; `service.ts:521-524` `rejectTrip` → terminal `rejected`; `service.ts:365-397` `expireStaleOffers` → terminal `expired`; `passenger-trips/service.ts:128` `retryTrip` exige `pending`.
- Impacto: driver rechaza o expira → trip queda `rejected`/`expired` sin rematch; el pasajero no recibe `broadcastToPassenger` (inventario: "NO en offer/reject/expire/no-drivers"), se queda en ConnectingDriver hasta el timeout de 30s y luego retry → 400.
- Repro: pasajero solicita con 1 driver online; driver rechaza; pasajero nunca avanza ni puede reintentar.
- Fix: ver Paquete A.
- Riesgo: carrera con accept concurrente (rematch solo si sigue `offered` con ese `driver_id`); ciclos de import (mitigado: orquestar rematch desde `passenger-trips/service`).

**P0-2. Pasajero trabado post-claim: nunca avanza de "Conductor asignado" ni llega a TripComplete.**

- Evidencia: `mobile-passengers/src/screens/TripInProgressScreen.tsx:31-40` solo reacciona a `cancelled*`; `:66-80` `statusLabel` sin `in_trip`/`completed`; no hay `replace('TripComplete')` en ningún camino.
- Impacto: el viaje termina en el driver y el pasajero queda en "Conductor asignado" para siempre.
- Repro: completar viaje como driver → la UI pasajero no cambia.
- Fix: ver Paquete C.

**P0-3. Location uplink del driver muere al salir de Active.**

- Evidencia: `useLocationWS` solo se invoca en `ActiveScreen.tsx:79`. `NavigationScreen`/`WaitingPassengerScreen`/`TripInProgressScreen` no lo llaman. El `close` del WS marca offline (`location/routes.ts:101-107`). `broadcastTripLocation` solo corre en el `message` del WS (`location/routes.ts:91-99`).
- Impacto: mid-trip el driver se marca offline (cleanup a los 60s, agravado por P1-12), el pasajero no puede trackear.
- Fix: ver Paquete B.

**P0-4. `claim` vs `accept` divergentes + `respondToTrip('accept')` sin broadcast.**

- Evidencia: `claimTrip` exige `driver_id===null` (`service.ts:743-745`) → 409 post-match; el path real es `/accept` (`service.ts:479`, `IncomingRequestScreen.tsx:193`). `respondToTrip('accept')` hace push pero NO `broadcastToPassenger` (`service.ts:321-351`), a diferencia de `acceptTrip` (`:508-515`) y `claimTrip` (`:776-778`).
- Impacto: cualquier cliente que use `/respond` deja al pasajero sin señal realtime; specs hablan de claim pero el código no lo usa.
- Fix: ver Paquete D.

**P0-5. ConnectingDriver retry roto tras matching.**

- Evidencia: `retryTrip` exige `pending` (`passenger-trips/service.ts:128`); tras offered→expired el trip es `expired` → retry 400. Timeout UI 30s (`ConnectingDriverScreen.tsx:12`) vs offer 20s (`matching.service.ts:9`).
- Impacto: botón "Buscar conductor de nuevo" es no-op/400.
- Fix: Paquete A (retry desde `expired`) + Paquete C (empty state que funcione).

### P1 — bugs reales

**P1-6. Rating mutuo imposible (ai-12).**

- Evidencia: ambos `rateTrip` exigen `completed` y flippean a `rated` — passenger `passenger-trips/service.ts:346,362-371`; driver `ratings/service.ts:37,41-44`. El segundo rater recibe 400.
- Impacto: solo uno de los dos puede calificar.
- Fix: decisión de producto (ai-12). Esta pasada: NO implementar; documentar. (Fuera de alcance del matching spec.)

**P1-7. `cancelled_early`/`cancelled_late` dead.**

- Evidencia: `service.ts:114-121` remapea; `VALID_TRANSITIONS.waiting=['in_trip']` (`:23`) no los incluye → 400. `WaitingPassengerScreen.tsx:27` timer 300s es cosmético (no no-show).
- Impacto: driver no puede cancelar en `waiting`/`in_trip`; copy del timer miente.
- Fix: Paquete E (opcional, con decisión).

**P1-8. IncomingRequest descarta payload del broadcast.**

- Evidencia: `ActiveScreen.tsx:126-131` navega sin usar payload; `IncomingRequestScreen.tsx:82-120` re-fetch `/trips/active` con retries.
- Impacto: race donde navega antes de que `/trips/active` vea el offer.
- Fix: Paquete D.

**P1-9. Reject manual fuerza offline; timeout deja online.**

- Evidencia: manual `IncomingRequestScreen.tsx:230-234` (`PUT /drivers/me/online false`); timeout `:127-133` solo POST reject, sin offline. Timeout usa `RESPONSE_SECONDS=20` hardcodeado, no lee `expires_at`.
- Impacto: comportamiento inconsistente entre reject y timeout.
- Fix: Paquete D.

**P1-10. TabBar del driver siempre visible.**

- Evidencia: `apps/mobile/app/_layout.tsx:93` `<TabBarShell />` incondicional; `TabBarContext.tsx` no tiene flag de visibilidad.
- Impacto: puede abandonar un viaje activo por tabs.
- Fix: Paquete D (ocultar en rutas de viaje). Riesgo bajo-medio (toca layout global).

**P1-11. Verification code leak en DTO.**

- Evidencia: `getActiveTrip`/`getTripById` devuelven `getTableColumns(trips)` completo incluyendo `verification_code` (`service.ts:629`). `PassengerCodeScreen.tsx` (DEV) lo muestra.
- Impacto: el driver puede start sin pedir el código al pasajero.
- Fix: Paquete D (excluir `verification_code` del DTO de conductor salvo el propio flujo). **Nota:** el pasajero sí necesita el código (lo muestra); el driver no lo necesita vía `/trips/active`. Omitir solo del lado driver.

**P1-12. `cleanup.ts` statuses stale.**

- Evidencia: `cleanup.ts:9-14` `ACTIVE_TRIP_STATUSES = ['request_received','accepted','driver_arrived','in_progress']` — omite `en_route`/`waiting`/`in_trip`; incluye `driver_arrived`/`in_progress` que nunca se escriben.
- Impacto: driver en viaje puede marcarse offline a los 60s sin heartbeat (agravado por P0-3).
- Fix: Paquete B (alinear con `trip-utils.ts` `ACTIVE_TRIP_STATUSES = ['accepted','en_route','waiting','in_trip']`).

**P1-13. `TripStatus` passenger omite `in_trip`.**

- Evidencia: `mobile-passengers/src/api/types.ts:9-22` no tiene `'in_trip'`.
- Impacto: type hole + UI sin copy para in_trip.
- Fix: Paquete C.

**P1-14. Call passenger/driver no-op.**

- Evidencia: `mobile-passengers/src/screens/TripInProgressScreen.tsx:128` `onPress={() => {}}`.
- Impacto: botón "Llamar" no hace nada.
- Fix: Paquete C (usar `Linking.openURL(tel:)` con `trip.driver_phone` si existe).

**P1-15. Fare mock en VehicleSelect.**

- Evidencia: `VehicleSelectScreen` precios mock; `estimateFare` existe (`passenger.ts:19`) y no se llama.
- Impacto: precio mostrado no coincide con el real.
- Fix: NO prioritario (non-goal del matching spec). Paquete opcional si sobra tiempo.

### P2 — deuda / mocks / cobertura

- P2-16: `TripCompleteScreen` passenger mock (Juan Pérez, $3.500) — `TripCompleteScreen.tsx:17,31`. Se arregla en Paquete C.
- P2-17: `TripRequestScreen` passenger orphan mock, no linkeado.
- P2-18: SOS UI ausente en ambas apps; backend `POST /api/sos` listo (ai-5b done). Backlog, NO implementar.
- P2-19: Chat wired, no tocar.
- P2-20: Tests. Driver: solo `incoming-request.test.tsx`. Passenger: ConnectingDriver + TripInProgress parcial. Backend: sin tests de claim/respond/`expireStaleOffers`/rematch/reject.
- P2-21: `requireRole` definido no usado; dual-role intencional (PR #254). No tocar.
- P2-22: `broadcastTripCancelled` exportado nunca llamado (`service.ts:60`); cancel pasajero inlinea el HTTP (`passenger-trips/service.ts:263-279`).
- P2-23: Matching no filtra driver con viaje activo, `vehicle_type`, district, KYC (`findNearbyDrivers` solo `is_online` + coords no-nulas, `matching.service.ts:34-40`).

### Findings adicionales (ECH)

- `rejectTrip` y `respondToTrip('reject')` tampoco emiten `broadcastToPassenger` (idéntico a accept).
- `expireStaleOffers` no libera `driver_id`, no rematchea, no notifica.
- `getActiveTrip` (passenger, `passenger-trips/service.ts:173`) excluye terminales → tras `expired`/`rejected` el pasajero pierde el viaje silenciosamente (resume a Home sin explicación).
- `matchAndBroadcast` no recibe `passenger_id`, por lo que estructuralmente no puede notificar al pasajero en el caso 0-drivers.
- `retryTrip` no reabre desde `expired`.

## Fuera de alcance (backlog)

SOS UI (ai-5), payment MercadoPago/cash MVP (ai-8, 6-3), favoritos backend (ai-10), trip detail (ai-9, 7-2), mutual rating (ai-12, decisión de producto), tab bar redesign completo, live marker fancy.

## Orden de reparación (DAG)

```
Paquete A (backend matching) ──► Paquete C (passenger lifecycle)
Paquete B (driver location WS) ─► (independiente, paralelo a A)
Paquete D (contratos accept/claim + notify + tabbar)
Paquete E (cancel/waiting) — opcional, solo si A–D verdes
```

A y C se acoplan por el contrato de eventos (0-drivers / expired / rematch): A define los eventos, C los consume.

---

## Reparación ejecutada (branch `fix/trip-flow-audit`)

### Paquete A — Matching no deja zombies (backend) ✅

- `matching.service.ts`: `findNearbyDrivers` acepta `excludeDriverIds`; `matchAndBroadcast` acepta `passenger_id` + `options.excludeDriverIds`.
- `passenger-trips/service.ts`:
  - `requestTrip` pasa `passenger_id` y, si 0 drivers, emite `broadcastPassengerNoDrivers` (evento `trip:status` con `drivers_found:0`).
  - `retryTrip` ahora permite `pending` **y** `expired` (reabre `expired→pending`).
  - Nuevo `releaseAndRematch(tripId, excludedDriverId)` (acepta `offered|expired|rejected`, libera `driver_id`, vuelve a `pending`, rematchea excluyendo al driver).
  - `broadcastToPassenger` acepta `extra` para el flag `drivers_found`.
- `trips/service.ts`:
  - `rejectTrip`: en mundo pasajero (`passenger_id` + `offered`) → `releaseAndRematch` en vez de terminal.
  - `respondToTrip('accept')`: ahora `broadcastToPassenger` (paridad con `acceptTrip`).
  - `respondToTrip('reject')`: rematch en mundo pasajero.
  - `expireStaleOffers`: tras expirar, rematch si `passenger_id` + `driver_id`.

### Paquete B — Location WS vive todo el viaje (driver) ✅

- `useLocationWS.ts`: acepta `enabled` (en vez de leer `isOnline` interno).
- Nuevo `components/LocationSync.tsx`: monta `useLocationWS` + heartbeat 30s + `startTracking`, gateado por `isOnline || tripStatus in {accepted,en_route,waiting,in_trip}`. Montado en `app/_layout.tsx` (persistente, no atado a ActiveScreen).
- `ActiveScreen.tsx`: removido `useLocationWS()` + heartbeat effect (ahora en LocationSync).
- Nota: `cleanup.ts` statuses stale (P1-12) **NO** corregido en esta pasada — quedó en scope de Paquete B pero lo difiero: es un cambio pequeño y seguro; ver "Riesgos residuales".

### Paquete C — Passenger sigue el lifecycle ✅

- `TripInProgressScreen.tsx`: suscripción realtime ahora actualiza `rideStore` para todos los status; `completed` → `replace('TripComplete')`; agregado `in_trip` a `statusLabel`; botón "Llamar" usa `Linking.openURL(tel:)`.
- `TripCompleteScreen.tsx`: datos reales del trip + `rateRide` (rating opcional, skip permitido).
- `ConnectingDriverScreen.tsx`: maneja `drivers_found:0`/`expired`/`rejected` → empty state + retry funcional.
- `types.ts`: agregado `in_trip` y `driver_phone`.

### Paquete D — Contratos accept/claim + notify ✅

- `respondToTrip('accept')` broadcast (en Paquete A).
- `IncomingRequestScreen.tsx`: seedea trip desde payload de `trip:request` (via tripStore en ActiveScreen); reject manual **ya no fuerza offline** (simétrico con timeout).
- `app/_layout.tsx`: TabBar oculto en rutas de viaje (`incoming-request`, `navigation`, `waiting-passenger`, `trip-in-progress`, `trip-complete`, `chat`).

### Paquete E — Cancel/waiting ⏸️ (diferido)

`cancelled_early`/`cancelled_late` (P1-7) requiere decisión de producto (¿el driver puede cancelar en `waiting` por no-show?). No implementado. Copy del timer de WaitingPassenger (300s) sigue siendo cosmética.

## Verificación

```bash
bun run lint          # ✅ biome check . — 0 errores (tras bun run format)
bun run typecheck     # ✅ 3 packages (backend, mobile, mobile-passengers)
bun --filter @lifty/backend test   # ✅ 344 pass / 0 fail (347 tests, 3 skip)
```

Mobile:
- `apps/mobile`: `incoming-request.test.tsx` ✅ 10/10. Pre-existentes rotos (fuera de alcance): `doc-types`, `session-restore` (supabaseKey env var), `login-phone` (useSegments no mockeado).
- `apps/mobile-passengers`: `TripInProgress` (5/5, **reparado** — antes no corría por supabase env), `ConnectingDriver` (6/6), resto OK.

E2E manual (2 Expo + backend): **no corrido** — no levante entornos móviles; queda explícito como no-verificado.

## Riesgos residuales

- `releaseAndRematch` no es transaccional con `rejectTrip`/`expireStaleOffers`: ventana mínima de carrera con accept concurrente mitigada por `WHERE id + driver_id + status IN (offered|expired|rejected)`.
- `cleanup.ts` (P1-12) sigue con statuses stale (`driver_arrived`/`in_progress`) y omite `en_route|waiting|in_trip`. Combinado con LocationSync ahora vivo, el riesgo baja, pero el cleanup puede aún marcar offline a un driver en viaje si el WS se cae >60s. **Queda como follow-up inmediato.**
- Verification code leak (P1-11): no tocado. El driver aún puede leer `verification_code` desde `/trips/active`/`/:id`.
- Rating mutuo (P1-6/ai-12): requiere decisión de producto, no implementado.
- `respondToTrip`/`claim` siguen sin uso en mobile; `claimTrip` sigue 409 post-match (comportamiento legacy documentado, no es bug activo).
