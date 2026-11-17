# fix(mobile-passengers): driver avatar/marker stuck at pickup during in_trip

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
Apps: **`apps/backend`** + **`apps/mobile-passengers`** (publisher path en conductor solo si hace falta para smoke; no rediseñar UI driver)  
Base: `origin/main` tip **`4adc4ab`** — siempre `git fetch origin main && git rev-parse origin/main` al arrancar  
Branch: `fix/passenger-driver-marker-stuck-pickup`  
ClickUp: https://app.clickup.com/t/1dfc7p9x4r4  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Síntoma (Martina / QA)

En la app **pasajero**, una vez que el conductor **recoge** al pasajero e inicia el viaje (`in_trip`), el **avatar/marcador del conductor** en el mapa queda **fijo en el punto de recogida** (o en la última posición pre-start) y **no sigue** el trayecto hasta el destino.

Repro:
1. Solicitar + aceptar viaje.
2. Conductor: en camino → llegó → start con código → `in_trip`.
3. Observar mapa pasajero durante el trayecto.
4. Actual: marcador pegado en pickup.
5. Esperado: marcador se mueve en vivo hasta destino.

DoD: dual-OS Android + iOS. HARD STOP EAS (`eas build|submit|update` / `bun run eas:*` prohibido).

## Arquitectura (no reinventar)

```
Driver GPS (fg watch / bg TaskManager)
  → locationStore lat/lng
  → useLocationWS → WS /ws/location          → upsert + broadcastTripLocation(tripId)  ✅
  → heartbeat PUT /drivers/me/heartbeat      → upsert only                         ❌ no broadcast (tip)
  → POST /location/update                    → upsert only                         ❌ no broadcast (tip)

Backend broadcastTripLocation
  → Supabase Realtime HTTP broadcast topic `trip:{tripId}` event `driver:location`

Passenger TripInProgressScreen
  → subscribeToDriverLocation(tripId) → rideStore.driverLocation
  → marker coord = driverLocation ?? trip.driver_lat/lng (join driver_locations en GET active)
  → NO poll de ubicación en tip
  → PassengerMap / mapHtml updateMarkers (re-draw OK si llegan coords nuevas)
```

Statuses live (BE + pax): `accepted | en_route | waiting | in_trip`  
`getDriverActiveTrip` ya incluye esos cuatro.

## Ya en tip (no re-greenfield)

- `subscribeToDriverLocation` + trip hub compartido chat/location — `apps/mobile-passengers/src/lib/realtime.ts`
- WS path ya hace broadcast — `apps/backend/src/features/location/routes.ts` message handler
- Throttle broadcast 500 ms / 5 m — `apps/backend/src/shared/lib/broadcast.ts`
- `getActiveTrip` / getTrip joinea `driver_lat/lng` desde `driver_locations` — `passenger-trips/service.ts`
- Swipe-back viaje **#552** — OUT de este PR
- Cancel-rate motor **#492** — OUT (CU `1dfc7p9x4qz`)

## Hipótesis rank (tip `4adc4ab`)

1. **CONFIRMADO en código:** heartbeat + HTTP location update **no** llaman `broadcastTripLocation`. En trip real el conductor suele ir a Navigation / background → WS cae o no manda → pax deja de recibir `driver:location`.
2. **CONFIRMADO en código:** pax **no** tiene poll fallback de coords; solo realtime.
3. **CONFIRMADO en código:** fallback UI `driverLocation ?? trip.driver_lat` congela la última coord mergeada (suele ser cerca de pickup al accept) si realtime muere.
4. Merge `trip:status` `{...active, ...incoming}` puede pisar `driver_lat/lng` si el payload trae null — verificar payload de `broadcastToPassenger` / transition; preservar coords previas si incoming no trae números válidos.
5. (Menor) `setDriverLocation(null)` si status sale de LIVE o falta `driver_id` momentáneo — solo si evidence en device.
6. (Menor) mapHtml / avatar URL — draw path OK; no es root de “stuck at pickup” si las coords no cambian.

## Scope

**IN**
1. **BE** — al actualizar ubicación con viaje activo, broadcast igual que WS:
   - `driversService.heartbeat` después de `upsertLocation` si hay lat/lng → `getDriverActiveTrip` + `broadcastTripLocation`
   - `POST /location/update` igual
   - Reusar helpers existentes; no duplicar throttle (ya en `broadcastTripLocation`)
2. **Pax** — en `TripInProgressScreen` (o hook chico):
   - Mientras status ∈ LIVE y hay `trip.id` + `driver_id`: poll cada **3–5 s** `getActiveRide()` (o GET trip) y `setDriverLocation` desde `driver_lat/lng` si son números válidos
   - Realtime sigue siendo el path rápido; poll = resiliencia
   - Al mergear status: no pisar `driver_lat`/`driver_lng` con `null`/`undefined` del incoming
   - No limpiar `driverLocation` en transiciones **dentro** de LIVE
3. Tests:
   - BE: heartbeat (y/o location/update) con active trip dispara broadcast (mock fetch / spy patrón de `location.test.ts`)
   - Pax: si hay test de screen/store, cubrir “poll actualiza driverLocation en in_trip” y “merge status no borra coords”
4. PR monorepo a `main`, conventional commit, `/review` post-create

**OUT**
- `apps/mobile` UI Navigation / MapLibre driver redesign
- Cambiar TaskManager para abrir WS en background (preferí BE broadcast desde heartbeat — ya corre en bg)
- Matching, offers, push ringtone
- Map chrome attribution/+/- (`passenger-map-chrome-lock`)
- Swipe-back / cancel-rate / WhatsApp / account deletion
- Animación interpolada fancy del marker (KISS: coords frescas bastan)
- `git add -A`, APKs, `.ops-local`, secrets
- EAS

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/backend/src/features/drivers/service.ts` | `heartbeat` — agregar broadcast post-upsert |
| `apps/backend/src/features/location/routes.ts` | WS (SoT) + HTTP `/update` sin broadcast |
| `apps/backend/src/shared/lib/broadcast.ts` | `broadcastTripLocation` |
| `apps/backend/src/shared/lib/trip-utils.ts` | `getDriverActiveTrip` |
| `apps/backend/src/features/location/location.test.ts` | patrón test broadcast WS — extender heartbeat/HTTP |
| `apps/backend/src/features/drivers/drivers.test.ts` | tests heartbeat |
| `apps/mobile-passengers/src/screens/TripInProgressScreen.tsx` | subscribe + marker + LIVE effect |
| `apps/mobile-passengers/src/lib/realtime.ts` | `subscribeToDriverLocation` |
| `apps/mobile-passengers/src/store/rideStore.ts` | `driverLocation` |
| `apps/mobile-passengers/src/api/passenger.ts` | `getActiveRide` |
| `apps/mobile/src/components/LocationSync.tsx` | contexto: WS + heartbeat 30s |
| `apps/mobile/src/lib/backgroundLocationTask.ts` | solo heartbeat en bg |
| `apps/mobile-passengers/src/components/Map/mapHtml.ts` | updateMarkers (solo si coords llegan) |

## Diseño de fix (KISS)

### A) BE — un solo helper interno (opcional)

```ts
async function publishDriverLocationIfOnTrip(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number | null,
) {
  const active = await getDriverActiveTrip(driverId);
  if (!active) return;
  broadcastTripLocation(active.id, {
    lat,
    lng,
    heading: heading ?? undefined,
    driver_id: driverId,
  });
}
```

Llamar desde:
- WS message (puede quedar inline o helper — no romper tests WS)
- `heartbeat` cuando `body.lat/lng` numéricos post-`upsertLocation`
- `POST /location/update` post-upsert

### B) Pax — poll + merge seguro

```ts
// pseudocode
useEffect(() => {
  if (!tripId) return;
  const live = LIVE_STATUSES.includes(status);
  if (!live) return;
  const tick = async () => {
    const t = await getActiveRide().catch(() => null);
    if (!t || t.id !== tripId) return;
    if (typeof t.driver_lat === 'number' && typeof t.driver_lng === 'number') {
      setDriverLocation({ lat: t.driver_lat, lng: t.driver_lng, heading: null });
    }
  };
  void tick();
  const id = setInterval(tick, 4000);
  return () => clearInterval(id);
}, [tripId, status]);
```

Merge status:
```ts
const prev = useRideStore.getState().activeTrip ?? {};
const merged = { ...prev, ...incoming };
if (incoming.driver_lat == null) merged.driver_lat = prev.driver_lat;
if (incoming.driver_lng == null) merged.driver_lng = prev.driver_lng;
```

## Criterios de aceptación

- [ ] En `in_trip`, el marcador se mueve cuando el conductor avanza (device o test con coords mock).
- [ ] Con WS caído / solo heartbeat bg, pax igual recibe updates (broadcast BE y/o poll).
- [ ] No null-island `[0,0]`; no marker en pickup si el driver ya no está ahí.
- [ ] accepted/en_route/waiting siguen funcionando (no regresión pre-pickup).
- [ ] Tests BE verdes del path location/heartbeat tocado.
- [ ] Dual-OS smoke manual documentado en PR.
- [ ] HARD STOP EAS respetado.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
export PATH="$HOME/.bun/bin:$PATH"
git fetch origin main
git checkout -B fix/passenger-driver-marker-stuck-pickup origin/main

# scoped
bun --filter @lifty/backend test
# o archivos: location + drivers heartbeat
bun --filter @lifty/mobile-passengers test
bun run typecheck
bun run lint   # o biome scoped a archivos tocados

# smoke (Expo Go, no EAS):
# 1) dual-role trip lab → in_trip → mover conductor → pax marker se mueve
# 2) background driver app 30s+ → pax sigue actualizando
```

## Entrega

1. Una rama, commits conventional **subject lowercase** (commitlint subject-case — no “Driver” Start Case).
   - Ej: `fix(backend): broadcast trip location from heartbeat and http update`
   - Ej: `fix(passengers): poll driver coords when live trip marker goes stale`
2. **No** `git add -A` — solo archivos del fix (+ este handoff si lo actualizás).
3. PR a `main` con body:
   - ClickUp URL
   - root cause 3–5 líneas
   - test plan
4. Post-create: `gh pr comment <N> --body '/review'`
5. Comment en ClickUp con PR URL + rama (si MCP/REST anda).
6. **Complete CU solo después del merge** a main.
7. Si `/review` bot nits cosméticos desktop-only: COMMENT, no bloquear salvo phone roto.

## Anti-patrones

- Re-greenfield realtime hub o MapLibre stack
- Solo “animar” el pin sin arreglar publish/poll
- Meter cancel-rate / swipe / map chrome en el mismo PR
- Confiar en que WS siempre vive en background Android
- Marcar complete en ClickUp antes del merge
