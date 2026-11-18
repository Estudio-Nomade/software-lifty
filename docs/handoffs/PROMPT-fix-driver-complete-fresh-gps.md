# fix(mobile): fresh GPS on trip complete before TOO_FAR check

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
App: **`apps/mobile` only** (conductor)  
Base: `origin/main` tip **`72e8a53`** — `git fetch origin main && git rev-parse origin/main` al arrancar  
Branch: `fix/driver-complete-fresh-gps` (ya creada desde tip; no recrear desde dirty main)  
ClickUp: https://app.clickup.com/t/1dfc7p9x8fr  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Pack lock (1:1:1)

Este es **pack 1/3** complete-proximity. **NO** mezclar en el mismo PR:

| Pack | CU | Scope |
|------|-----|--------|
| **1 (este)** | `1dfc7p9x8fr` | Fresh `getCurrentPosition` antes de POST complete |
| 2 | `1dfc7p9x8ft` | Gate por `accuracy` + copy “GPS impreciso” |
| 3 | `1dfc7p9x8fu` | UI metros al pin pre-submit |

## Síntoma (Martina / QA lab)

Conductor y pasajero **enfrente del destino**. App dice “Llevando a Sole Yaquinta”. Nav puede decir “en 197 m girar a la izquierda en General Pinto”. FINALIZAR → *“Debes estar a menos de 50 metros del destino”* (`TOO_FAR_FROM_DESTINATION`). Esperan + caminan ~10 m → GPS actualiza → complete OK.

Viaje anterior OK; no es regresión del umbral BE (50 m desde #237). Apps pegan a **api.liftyviajes.com** (VPS production) — local `BYPASS_DISTANCE_CHECK` **no aplica**.

Dual-OS. **HARD STOP EAS** (`eas build|submit|update` / `bun run eas:*` forbidden).

## Root cause (CONFIRMADO tip `72e8a53`)

```tsx
// TripInProgressScreen.handleCompleteTrip
await apiClient.post(`/trips/${trip.id}/complete`, {
  lat: locationLat,  // zustand — puede estar stale
  lng: locationLng,
});
```

- BE `completeTrip`: `haversineDistance(body.lat, body.lng, trip.dest_lat, trip.dest_lng) > 0.05` → TOO_FAR.
- No pide fix fresco al tap.
- `getCurrentPosition()` ya existe en `apps/mobile/src/lib/location.ts` (High → Balanced fallback) y escribe store vía `applyLocationCoords`.
- Nav “197 m” = `useDynamicRouting` (ruta vial cada 10 s) — **otra métrica**; no “arreglar” directions en este PR.
- Rate limit complete 3/min es síntoma secundario del spam; no reescribir ratelimit acá.

## Scope

**IN**
1. En `handleCompleteTrip`, **antes** del POST:
   - `await getCurrentPosition()` (import desde `../lib/location`).
   - Leer coords actualizadas de `useLocationStore.getState()` (o devolverlas desde helper si lo extendés mínimo).
   - Si lat/lng null post-fix → setCompleteError claro de ubicación (no TOO_FAR).
   - POST con esas coords.
2. Mantener `completing` true durante el fix + request.
3. Conservar handling existente TOO_FAR / token / Snackbar `distanceMeters`.
4. Tests: si extraés helper puro “resolveCompleteCoords”, unit test; no flaky GPS en CI.
5. Smoke manual Expo Go: complete cerca del pin sin ritual caminar-10m si GPS real ≤50 m.

**OUT**
- BE umbral 0.05 / `BYPASS_DISTANCE_CHECK`
- `gps_accuracy_m` gate copy (pack 2)
- Label metros idle (pack 3)
- `NavigationScreen` arrived (salvo copy-paste accidental — no)
- `useDynamicRouting` / maneuvers
- Pax app, EAS, `git add -A`, dev-all LAN dirty

## DESIGN LOCK

- No rediseñar bottom card / MapView / theme.
- CTA title sigue **FINALIZAR VIAJE**.
- Snackbar tones: warning TOO_FAR, error genérico — igual espíritu.

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | handleCompleteTrip |
| `apps/mobile/src/lib/location.ts` | `getCurrentPosition` (mínimo; return coords solo si hace falta) |
| `apps/mobile/src/store/locationStore.ts` | leer post-refresh |
| `apps/backend/src/features/trips/service.ts` | SoT umbral — **leer no reescribir** |

## Sketch

```tsx
const handleCompleteTrip = async () => {
  if (!trip?.id) return;
  setCompleting(true);
  setCompleteError(null);
  try {
    await getCurrentPosition();
    const { lat, lng } = useLocationStore.getState();
    if (lat == null || lng == null) {
      setCompleteError({
        title: 'No se pudo finalizar el viaje',
        message: 'No pudimos obtener tu ubicación. Activá el GPS e intentá de nuevo.',
        tone: 'error',
        distanceMeters: null,
      });
      return;
    }
    const response = await apiClient.post(`/trips/${trip.id}/complete`, { lat, lng });
    // ... existing success path
  } catch (err) {
    // ... existing TOO_FAR / token handling (distanceMeters con lat/lng frescos del store)
  } finally {
    setCompleting(false);
  }
};
```

## Criterios de aceptación

- [ ] FINALIZAR siempre intenta fix fresco antes del POST.
- [ ] Sin GPS → mensaje ubicación, no TOO_FAR inventado.
- [ ] Con GPS fresco ≤50 m del pin → complete OK (smoke lab).
- [ ] TOO_FAR real sigue mostrando metros cuando aplica.
- [ ] Dual-OS Android + iOS.
- [ ] HARD STOP EAS.
- [ ] No cambios pack 2/3 / BE radius.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
export PATH="$HOME/.bun/bin:$PATH"
gh auth switch --user martiyaquinta
git fetch origin main
git checkout fix/driver-complete-fresh-gps   # ya existe con handoff staged; si no: -B desde origin/main
# no git add -A — solo archivos de este fix (+ handoff ya staged)

bun --filter @lifty/mobile test
bun --filter @lifty/mobile exec tsc --noEmit   # o monorepo typecheck scoped
bun run typecheck   # si el peer suele correr root

# smoke Expo Go conductor (API api.liftyviajes.com o local sin confiar en BYPASS en VPS):
# in_trip → cerca pin → FINALIZAR sin caminar ritual si GPS bueno
```

## Entrega

1. Conventional commits, subject **lowercase** (commitlint subject-case).  
   Ej: `fix(mobile): refresh gps before trip complete distance check`
2. No `git add -A` (APKs, `.ops-local`, `scripts/dev-all.ts` dirty LAN, handoffs de otros packs).
3. PR a `main`: ClickUp URL + root cause 3–5 líneas + test plan + “pack 1/3; no radius change”.
4. `gh pr comment <N> --body '/review'`
5. Comment ClickUp con PR URL.
6. **Complete CU solo post-merge**.

## Anti-patrones

- Aflojar 50 m “para que pase”
- Meter accuracy UI o metros preview en este PR
- Reescribir LocationSync / background task
- Confundir distKm de directions con haversine al pin
- EAS / push main / self-merge sin CI
