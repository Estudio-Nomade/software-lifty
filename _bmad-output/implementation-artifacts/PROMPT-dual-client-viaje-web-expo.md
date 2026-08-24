# PROMPT — Dual client: pasajero web + conductor Expo Go (flujo de solicitud)

**Para:** agente ejecutor (fresh context). No heredes historial.
**De:** orquestador del proyecto Lifty
**Idioma:** español
**Fecha:** 2026-08-19
**Repo:** `/home/marti/Documentos/LIfty/software-lifty`
**Branch actual al escribir esto:** `feat/driver-cancellation-policy-screen` (tiene TVF UI). **NO trabajes sobre esta branch.** Creá una branch nueva desde `main` actualizado (o desde `main` + lo mínimo mergeado que necesites). Nunca pushear a `main`. Todo por PR. Conventional Commits.
**No commitees** a menos que el humano lo pida.

---

## Quién sos y qué tenés que hacer

Sos el ejecutor de un **enablement de dual-client local**. El humano tiene una sola máquina y un celular con Expo Go. Quiere **ser pasajero y conductor al mismo tiempo** y recorrer el flujo de solicitud de viaje.

**Setup canónico (no lo discutas, está decidido):**

| Rol | App | Cómo se abre | Puerto Metro |
|---|---|---|---|
| Pasajero | `apps/mobile-passengers` | **browser** (`expo start --web`) | **8082** |
| Conductor | `apps/mobile` | **Expo Go** (QR) | **8081** |
| API | `apps/backend` | `localhost` | **3000** (o el que escriba `.env`) |

**Objetivo de aceptación (humano lo tiene que poder hacer sin vos al lado):**

1. Tres procesos vivos: backend + Metro pasajero web + Metro conductor.
2. Browser en `http://localhost:8082` → login pasajero → Home con mapa (no pantalla blanca).
3. Celular Expo Go → login conductor **aprobado** → Online → toggle ON → GPS subiendo.
4. Desde el browser: pickup + destino (autocomplete) → elegir vehículo → solicitar.
5. El celular muestra `IncomingRequest` en ≤20s.
6. Aceptar en el celular → el browser sale de “Buscando conductor…” y entra a viaje en curso.
7. (Dev) poder tocar Llegué / Iniciar / Finalizar **desde el escritorio**, sin caminar 50 m.

Si el happy path se traba por un bug de producto ya conocido, **arreglálo lo mínimo** para que el humano vea el flujo. No abras una auditoría nueva de todo el matching.

---

## Skills que DEBÉS invocar (fresh context)

1. `systematic-debugging` — antes de cada fix (web crash, matching 0 drivers, geofence, CORS).
2. `bmad-quick-dev` — implementación puntual.
3. `test-driven-development` — tests primero si agregás comportamiento (geofence bypass, map web, location pin).
4. `verification-before-completion` — **antes** de decir “listo”. Tenés que haber **corrido** los 3 procesos y, si no tenés Expo Go, dejar un script + checklist para el humano. No afirmes E2E celular si no lo corriste.
5. `bmad-code-review` — al cerrar, sobre el diff.

Leé y respetá:

- `AGENTS.md` (root) — no prod, no CD, `main` protegido.
- `apps/backend/AGENTS.md`
- `apps/mobile/AGENTS.md`
- `apps/mobile-passengers/AGENTS.md` (Leyes 1 y 2; theme passenger ≠ driver).
- `_bmad-output/implementation-artifacts/AUDIT-flujos-viaje.md` (mapa de bugs; no re-auditar).
- `_bmad-output/implementation-artifacts/spec-active-trip-lifecycle.md`
- Este prompt es el contrato. Si un spec viejo choca con el setup dual-client, gana este prompt.

---

## Restricciones (no negociables)

- Lifty está en desarrollo activo. **No deploy. No EAS. No CD.**
- No `bun run dev` (turbo) para este trabajo: levanta 3 Metros y en Linux explota `ENOSPC` (ver `apps/mobile-passengers/AGENTS.md` Troubleshooting).
- No toques política de cancelación / TVF / cobros (recién aterrizó en #267–#271).
- No implementes rematch multi-driver, SOS, MP, favoritos, trip detail.
- Theme: passenger `theme.colors.*` (primary `#00C2B3`, Inter). Driver `theme.colors.*` (turquoise `#1BBFAE`, Nunito). **No mergear themes.**
- Named exports. `StyleSheet.create()` al final. Sin comentarios. Sin secretos.
- No `@react-navigation/*`.
- Reuso: el driver **ya tiene** `apps/mobile/src/components/MapView.web.tsx`. El mapa web del pasajero se **adapta** de ahí (Ley 2), no se reescribe.
- Verificar: `bun run lint`, `bun run typecheck`, tests del paquete tocado.
- Branch + PR. Conventional Commits (`feat:`, `fix:`, `chore:`).

---

## Decisión de diseño (por qué este split)

Opciones consideradas:

| | A — Pasajero web + Driver Expo Go | B — Driver web + Pasajero Expo Go | C — dos Expo Go |
|---|---|---|---|
| Maps | PassengerMap es WebView-only → hay que portar | Driver ya tiene `MapView.web.tsx` | no hay web |
| Matching | driver manda GPS real al backend | browser GPS/IP es basura → 0 drivers o 5 km off | hace falta 2 celulares |
| Geofence 50 m | driver físico o DEV bypass | casi seguro falla arrived/complete | igual 50 m |
| UX del humano | tipea direcciones en laptop | aceptar viaje en laptop, pedir en el celu | no entra en el pedido |

**Gana A.** El humano pidió “una app web + la otra Expo Go”. El matching (`findNearbyDrivers`, radio 5 km, `drivers.is_online` + fila en `driver_locations`) **exige GPS de conductor de verdad**. El pasajero en web es el que más se beneficia del teclado.

No implementes B “por si acaso”.

---

## Estado actual (verificá, no asumas)

Inventario 2026-08-19:

### Ya existe

- `apps/mobile-passengers/package.json` → `"dev": "expo start --port 8082"`, `"web": "expo start --web"`.
- `apps/mobile/package.json` → `"dev": "expo start"` (8081 default), `"web": "expo start --web"`.
- `react-native-web` + `react-dom` en ambas.
- Driver `MapView.web.tsx`: iframe + blob HTML (MapLibre) + `postMessage`. Template a copiar.
- Passenger `PassengerMap.tsx`: **solo WebView**. En web = crash o mapa vacío.
- API URL auto: `Constants.expoConfig.hostUri` → LAN IP en Expo Go; `localhost` en web. Ver `apps/mobile/src/api/client.ts` y `apps/mobile-passengers/src/api/client.ts`.
- WS driver: `apps/mobile/src/lib/wsUrl.ts` (mismo truco de host).
- CORS backend: `CORS_ORIGIN` default `*` (`apps/backend/src/shared/middleware/security.ts`). Web → `localhost:3000` debería pasar.
- Flujo request real: Home overlay → VehicleSelect → `POST /api/passenger/trips/request` → ConnectingDriver → (si accept) TripInProgress.
- Matching: `matchAndBroadcast` ofrece solo al nearest online ≤5 km (`matching.service.ts`). Offer 20 s.
- Driver recibe offer solo con toggle ON en Active (`ActiveScreen` es el único con WS location + subscribe `trip:request`).
- Geofence: `arrivedTrip` y `completeTrip` exigen ≤50 m (`trips/service.ts` ~568 y ~624). **No hay bypass DEV hoy.**

### Bugs que van a romper el demo si no los tocás

Usá `AUDIT-flujos-viaje.md`. Solo estos entran en scope **si los reproducís**:

| ID | Síntoma en este setup | Qué hacer |
|---|---|---|
| P0-location-WS | WS location solo vive en `ActiveScreen`. Al aceptar, se desmonta → driver “desaparece” y cleanup puede marcar offline. | Mantener uplink de location + heartbeat en Navigation / Waiting / InProgress (mínimo: extraer el hook al layout de viaje, no re-arquitectar). |
| P0-passenger-status | `TripInProgressScreen` ignora `en_route`/`waiting`/`in_trip`/`completed`. El browser se queda en “Conductor asignado”. | Actualizar label + navegar a TripComplete en `completed`. No rediseñes TripComplete (puede seguir feo). |
| ConnectingDriver 30 s vs offer 20 s | Si el driver tarda, retry pide `pending` y da 400. | No implementes rematch. Documentá: aceptar en <20 s. Si el timeout UI miente, alinealo a 20 s o mostrá “sin conductor” sin retry roto. |
| Zombie trip | `GET /trips/active` / `getActiveRide` puede devolver un viaje viejo no-terminal → cold start manda al driver a WaitingPassenger. | Si te bloquea el demo: filtrar stale o dar escape a Online. No reabras #270 salvo que esté roto otra vez. |
| Geofence 50 m | Imposible “Llegué” sentado. | **DEV-only bypass** (abajo). |

### Linux ENOSPC

Si Metro muere con `watch '.../node_modules/.bun/' errno -28`:

```bash
sudo sysctl -w fs.inotify.max_user_watches=524288
sudo sysctl -w fs.inotify.max_user_instances=1024
```

No toques `metro.config.js` `blockList` de `.bun` (rompe resolución Bun). Preferí **no** levantar turbo.

---

## Paquetes de trabajo (en este orden)

### Paquete 0 — Branch + humo de procesos

```bash
git checkout main && git pull
git checkout -b feat/dual-client-web-expo
```

Confirmá que el backend arranca (`bun --filter @lifty/backend dev`) y responde `GET /api/health` o el health que exista.

**No uses `bun run dev`.** Comandos canónicos (dejálos escritos en el README corto del Paquete 5):

```bash
# terminal 1
bun --filter @lifty/backend dev

# terminal 2 — PASAJERO WEB
bun --filter @lifty/mobile-passengers exec expo start --web --port 8082

# terminal 3 — CONDUCTOR EXPO GO
bun --filter @lifty/mobile exec expo start --port 8081
```

Si `exec expo` no resuelve, usá `bun run web -- --port 8082` en passengers y `bun run start -- --port 8081` en mobile. El puerto 8082 **no es opcional**: choca con el default 8081 del driver.

Web del pasajero: `http://localhost:8082`.
Driver: QR en Expo Go (mismo Wi-Fi). `EXPO_PUBLIC_API_URL` / `hostUri` tiene que apuntar a la LAN del backend (`http://<LAN>:3000/api`), no a `localhost` del celular.

Si el `.env` de passengers tiene `EXPO_PUBLIC_API_URL=http://localhost:3000` **está bien para web**. El driver en Expo Go **no** puede usar localhost-del-celular. El auto-detect por `hostUri` ya cubre eso **si no pisás** `EXPO_PUBLIC_API_URL` en `apps/mobile/.env`. Verificá. Si está hardcodeado a localhost, eso es un bug de este setup: no lo dejes.

### Paquete 1 — Mapa pasajero en web

`PassengerMap.tsx` usa `react-native-webview`. En web no existe.

- Creá `apps/mobile-passengers/src/components/Map/PassengerMap.web.tsx`.
- Adaptá `apps/mobile/src/components/MapView.web.tsx` (iframe + `generateMapHtml` del propio passenger, no importes theme del driver).
- Misma API de props que `PassengerMap` (`centerCoordinate`, `userLocation`, `followUserLocation`, `recenterKey`, `onError`).
- Metro/Expo resuelve `.web.tsx` solo. No pongas `Platform.OS` if/else gigante en el archivo nativo.
- Humo: Home en Chrome muestra mapa MapLibre, no “Element type is invalid” / WebView missing.

Arreglá cualquier otro crash web **del camino login → Home → VehicleSelect → request**:

Candidatos típicos: `expo-notifications`, `expo-location` sin permiso browser, `SafeAreaView`, fuentes.

`Platform.OS === 'web'` solo donde haga falta. No forks masivos.

### Paquete 2 — Origen cerca del conductor (si no, matching = 0)

`findNearbyDrivers` filtra `is_online` + lat/lng not null + haversine ≤ 5 km.

Si el browser geolocaliza en otra ciudad (o niega permiso) y el celular está en Villa Dolores, **nunca matchea**.

Hacé esto, en orden de preferencia:

1. Pickup por autocomplete **ya manda coords reales** (PR #266). El humano puede tipear una dirección a <5 km del celular. Documentalo.
2. Si el GPS del browser falla, no dejes pickup en `(0,0)` ni en null silencioso. Pedí permiso / mostrá error claro.
3. **DEV pin (solo `__DEV__`)**: en Home, si `Platform.OS === 'web'`, un control discreto “Usar ubicación del conductor” no existe (no hay canal). En su lugar:
   - Chip / hint: “Para probar, elegí un origen a menos de 5 km del celular del conductor.”
   - Opcional y mejor: env `EXPO_PUBLIC_DEV_ORIGIN=lat,lng` que prefill pickup en web. Documentá cómo setearlo a la última ubicación del driver (el humano la ve en logs `[API]` / mapa del driver).

No inventes un endpoint nuevo de “teleport”.

Checklist matching (el humano o vos):

1. Conductor approved + online + WS mandó ≥1 punto (fila en `driver_locations`).
2. Pickup del request a ≤5 km de esa fila.
3. No hay trip zombie `offered`/`accepted` ocupando al driver.
4. Logs backend: `[matchAndBroadcast] Assigned nearest driver`.

Si ves `[matchAndBroadcast] No nearby drivers found`, no toques el algoritmo. Arreglá coords / online / zombie.

### Paquete 3 — DEV geofence bypass (arrived / complete)

Sin esto el demo muere en Navigation.

- Solo `__DEV__` (o `EXPO_PUBLIC_DEV_SKIP_GEOFENCE=1` leído en backend **y** default off).
- Si está on: `arrivedTrip` / `completeTrip` no rechazan por distancia. El resto de la state machine igual.
- Nunca on si `NODE_ENV === 'production'` (aunque no haya prod, no dejes el default abierto).
- Test backend: con flag off sigue el 400 a >50 m; con flag on acepta.
- En la UI driver, si el flag está on, un badge chico “DEV geofence off” está bien. No es obligatorio.

Alternativa aceptable si no querés tocar backend: en `__DEV__` el driver manda `lat/lng` del origin/dest en arrived/complete (spoof client). Es más sucio (el celular “miente”). Preferí el flag de backend.

### Paquete 4 — Mínimo para que el browser “vea” el viaje

Solo si al aceptar el browser no avanza:

1. ConnectingDriver escucha `trip:status` / poll y navega a TripInProgress en `accepted`.
2. TripInProgress actualiza copy en `en_route` | `waiting` | `in_trip`.
3. En `completed` → `replace('TripComplete')` aunque TripComplete siga mock.
4. Location WS del driver no se muere al salir de Active (si no, tracking vacío; el request/accept igual puede vivir).

No arregles rating mutuo, rematch, SOS, TabBar overlay, fare mock, ni cancel policy.

### Paquete 5 — Runbook para el humano

Escribí **un solo archivo**:

`_bmad-output/implementation-artifacts/RUNBOOK-dual-client-viaje.md`

Tiene que poder seguirse en 10 minutos. Incluí:

1. sysctl ENOSPC (Linux).
2. Los 3 comandos (no turbo).
3. URLs: passenger `http://localhost:8082`, backend `http://localhost:3000`, driver QR 8081.
4. Cuentas: cómo loguear un pasajero y un conductor **approved**. Si no hay seed de users, decí “usá las cuentas que ya tenés en local” — no inventes passwords. Si existe un seed/dev login, documentalo con evidencia `file:line`.
5. Orden: driver online **primero** (esperá 5–10 s de heartbeat) → después request.
6. Pickup <5 km del celular. Offer dura **20 s** — aceptar rápido.
7. Flag geofence DEV y cómo prenderlo.
8. Cómo matar zombies: SQL o pantalla. `GET /api/trips/active` / `GET /api/passenger/trips/active`.
9. Qué es éxito (los 7 puntos de arriba).
10. Fallas típicas y la causa (tabla):

| Qué ves | Causa más probable |
|---|---|
| Passenger web blanco / WebView | falta `.web.tsx` o crash de notifications |
| `ERR_NETWORK` en web | backend down o API_URL mal |
| Expo Go no habla con API | `EXPO_PUBLIC_API_URL=localhost` en driver `.env` |
| Request ok, driver no ve nada | no está en Active/online, o >5 km, o offer expiró |
| `No nearby drivers` | GPS driver no subió / pickup lejos / zombie |
| Accept ok, browser no cambia | P0 TripInProgress / ConnectingDriver |
| Llegué 400 | geofence 50 m, flag off |

---

## Fuera de scope

- App driver en web.
- Dos instancias Expo Go.
- Rematch, multi-offer, push FCM en web.
- EAS / tunneling / ngrok (salvo que `hostUri` no alcance; entonces documentá LAN, no subas un túnel al repo).
- Unificar mapas en un package.
- Arreglar todos los P0/P1 del AUDIT.
- Commits / PR a menos que el humano lo pida.

---

## Verificación (obligatoria)

Antes de “listo”:

```bash
bun run lint
bun run typecheck
bun --filter @lifty/backend test   # al menos suites trips / passenger-trips / location si las tocaste
```

Tests UI: si tocás PassengerMap / Home / ConnectingDriver / TripInProgress, corré los jest de ese paquete (`bun --filter @lifty/mobile-passengers test`, `bun --filter @lifty/mobile test`).

Humo web (lo tenés que haber corrido vos):

1. `expo start --web --port 8082` abre Home sin exception en consola de Chrome.
2. Autocomplete + VehicleSelect no crashean.
3. Network tab: `POST /api/passenger/trips/request` sale a `localhost:3000` (o el puerto real), no a `undefined`.

Humo E2E celular: si no tenés Expo Go, **no mientas**. Dejá el runbook + “bloqueado: falta dispositivo”. El orquestador no acepta “debería andar”.

---

## Entregable

1. Código de los paquetes 1–4 (el mínimo que falte).
2. `RUNBOOK-dual-client-viaje.md`.
3. Resumen al orquestador (no un ensayo):
   - branch
   - qué archivos
   - qué corriste (comandos + resultado)
   - qué del E2E verificaste vs qué queda para el humano con el celu
   - flags / env nuevos

Cuando termines, pará. No abras PR solo. No “siguiente feature”.
