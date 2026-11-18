# fix(mobile): GPS accuracy gate before complete TOO_FAR

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
App: **`apps/mobile` only** (conductor)  
Base: `origin/main` tip **`51d96187`** — al arrancar: `git fetch origin main && git rev-parse origin/main` (si el tip se movió, rebase a tip fresco; no partir de main sucio)  
Branch: `fix/driver-complete-gps-accuracy-gate`  
ClickUp: https://app.clickup.com/t/1dfc7p9x8ft  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Pack lock (1:1:1)

Este es **pack 2/3** complete-proximity. **NO** mezclar en el mismo PR:

| Pack | CU | Scope | Estado tip |
|------|-----|--------|------------|
| 1 | `1dfc7p9x8fr` | Fresh `getCurrentPosition` antes de POST complete | **#555 MERGED** tip `51d96187` — STALE greenfield |
| **2 (este)** | `1dfc7p9x8ft` | Gate por `accuracy` + copy “GPS impreciso” | **este PR** |
| 3 | `1dfc7p9x8fu` | UI metros al pin pre-submit | **otro PR** — no tocar |

## Síntoma (Martina / QA 2026-11-17)

Mismo incidente del radio 50 m: conductor enfrente del destino, FINALIZAR → a veces `TOO_FAR_FROM_DESTINATION` / “acercate al pin” aunque esté ahí. Con GPS indoor / Expo Go la **accuracy** del fix suele ser 40–80 m: el punto reportado puede caer fuera del círculo de 50 m aunque el cuerpo esté en el pin.

Producto: si la precisión del fix es mala, **no** usar el mismo copy de distancia. Mensaje warning tipo **“GPS impreciso, esperá un segundo”** y reintentar (sin spamear rate limit 3/min a ciegas).

Dual-OS (Android + iOS). **HARD STOP EAS** — prohibido `eas build|submit|update` y `bun run eas:*`. Smoke Expo Go / Metro only.

## Root cause (CONFIRMADO tip `51d96187` post-#555)

Pack 1 ya:
- `getCurrentPosition(): Promise<boolean>` refresca store antes del POST.
- `handleCompleteTrip` race 15s + POST con `submittedLat/Lng` locked.
- Snackbar TOO_FAR con `distanceMeters` haversine post-error.

**Falta accuracy end-to-end:**

1. `locationStore` solo tiene `lat | lng | heading | locationError` — **no** `accuracy`.
2. `applyLocationCoords(lat, lng, heading?)` en `locationCore.ts` **no** acepta ni persiste accuracy.
3. `getCurrentPosition` / watch / web aplican coords **sin** `pos.coords.accuracy` (native) ni `coords.accuracy` (web Geolocation).
4. POST complete body tip = `{ lat, lng }` only. BE `completeBody` / `completeTrip` **no** leen `gps_accuracy_m` (a diferencia de **arrived**: schema + service sí tienen optional `gps_accuracy_m` + `GPS_ACCURACY` vía `config.gpsAccuracyMaxM`).
5. Nota: `NavigationScreen.handleArrive` en tip **tampoco manda** `gps_accuracy_m` aún (BE listo, cliente arrived no) — **no** es scope de este PR arreglar arrived salvo reusar el mismo patrón de store si hace falta.

Conclusión: sin accuracy en store, el cliente no puede gatear pre-POST ni mandar el campo; el fail se ve como TOO_FAR genérico.

## Umbral (documentar en PR)

- Cliente gate sugerido: **`accuracy > 40`** metros → warning accuracy (no POST, o POST solo si product decide soft — **prefer no POST** para no quemar rate limit).
- BE mirror opcional: reusar espíritu arrived `gpsAccuracyMaxM` (hoy config cancel/arrive ~50 en `cancellations/config.ts`). Si agregás BE complete gate, alinear número y code `GPS_ACCURACY` (mismo mensaje que arrived o copy complete-specific).
- **No** aflojar el radio de destino **50 m** (`distance > 0.05` km en `completeTrip`).
- `BYPASS_DISTANCE_CHECK` solo local non-prod — no tocar.

## Scope

**IN**
1. Extender `locationStore` con `accuracy: number | null` (+ clear en `clearLocation` / set en `setLocation` o setter dedicado).
2. Extender `applyLocationCoords(..., accuracy?: number | null)` para persistir accuracy cuando venga; si no viene, preferir **null** (no inventar 0) o documentar leave-previous — elegir uno y testear.
3. Propagar accuracy desde:
   - native `getCurrentPositionAsync` → `pos.coords.accuracy`
   - native `watchPositionAsync` callback
   - web `getCurrentPosition` / `watchPosition` coords
   - background task path que llama `applyLocationCoords` (si el event trae accuracy)
4. En `TripInProgressScreen.handleCompleteTrip` **después** del fresh GPS pack 1 y **antes** del POST:
   - leer `accuracy` del store (o del helper si devolvés coords).
   - si `accuracy != null && accuracy > COMPLETE_GPS_ACCURACY_MAX_M` (const documentada, ej. 40):
     - `setCompleteError` tone **warning**, title/message estilo **“GPS impreciso, esperá un segundo”** (castellano criollo; no “TOO_FAR”).
     - `distanceMeters: null` (no fingir distancia al pin).
     - **return sin POST**.
5. Opcional (recomendado si bajo riesgo): mandar `gps_accuracy_m` en body complete + extender BE `completeBody` + `completeTrip` mirror arrived (`GPS_ACCURACY`). Si BE no entra en este PR, documentar follow-up — el gate **cliente** es el DoD mínimo.
6. Tests unit del store/helper de gate (sin GPS flaky en CI). No flaky device tests.
7. Manejo error BE `GPS_ACCURACY` en catch (si se implementa BE): copy accuracy, no TOO_FAR.

**OUT**
- Pack 1 re-greenfield (#555)
- Pack 3 UI “~Xm del pin” idle (`1dfc7p9x8fu`)
- Cambiar umbral 50 m destino / `BYPASS_DISTANCE_CHECK`
- Reescribir `useDynamicRouting` / maneuvers / “197 m girar…”
- `NavigationScreen` arrived UX (salvo no romper imports compartidos)
- `apps/mobile-passengers`, admin, EAS, `git add -A`, secrets, APKs, `.ops-local`

## DESIGN LOCK

- No rediseñar bottom card / MapView / CTA layout.
- CTA title sigue **FINALIZAR VIAJE**.
- Reusar `Snackbar` existente (`tone: 'warning' | 'error'`).
- Theme tokens only — no hardcode colores.
- No spinners nuevos salvo reutilizar `completing`.

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/mobile/src/store/locationStore.ts` | add accuracy |
| `apps/mobile/src/lib/locationCore.ts` | `applyLocationCoords` |
| `apps/mobile/src/lib/location.ts` | getCurrent / watch / web |
| `apps/mobile/src/lib/backgroundLocationTask.ts` | apply path bg |
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | gate pre-POST + Snackbar copy |
| `apps/backend/src/features/trips/schema.ts` | `completeBody` (si BE) |
| `apps/backend/src/features/trips/service.ts` | `completeTrip` + SoT arrived GPS_ACCURACY (leer) |
| `apps/backend/src/features/cancellations/config.ts` | `gpsAccuracyMaxM` SoT número BE |
| `docs/handoffs/PROMPT-fix-driver-complete-fresh-gps.md` | pack 1 histórico — no reimplementar |

## Sketch (orientativo)

```ts
// locationStore
accuracy: number | null;
setLocation: (lat, lng, heading?, accuracy?) => void;

// locationCore
export function applyLocationCoords(
  lat: number,
  lng: number,
  heading?: number | null,
  accuracy?: number | null,
): boolean { ... setLocation(..., accuracy) }

// TripInProgressScreen
const COMPLETE_GPS_ACCURACY_MAX_M = 40;
// post getCurrentPosition success:
const { lat, lng, accuracy } = useLocationStore.getState();
if (accuracy != null && accuracy > COMPLETE_GPS_ACCURACY_MAX_M) {
  setCompleteError({
    title: 'GPS impreciso',
    message: 'Esperá un segundo y volvé a intentar. La señal todavía no es confiable.',
    tone: 'warning',
    distanceMeters: null,
  });
  return;
}
await apiClient.post(`/trips/${trip.id}/complete`, {
  lat: submittedLat,
  lng: submittedLng,
  ...(accuracy != null ? { gps_accuracy_m: accuracy } : {}),
});
```

## Hipótesis rank (por si algo no cierra)

1. **CONFIRMADO tip:** store/apply sin accuracy → sin gate posible.
2. Web Geolocation a veces omite accuracy → tratar `null` como “unknown”: **no** bloquear solo por null (solo bloquear cuando accuracy **presente y mala**); documentar en PR.
3. Accuracy en metros ya (W3C / expo-location); no convertir de otra unidad.
4. TOO_FAR real (lejos del pin con accuracy buena) debe seguir copy pack 1 — no tapar con “GPS impreciso”.

## Criterios de aceptación

- [ ] `locationStore` expone accuracy del último fix aplicado.
- [ ] Fresh complete path propaga accuracy desde native (y web si disponible).
- [ ] Si accuracy > umbral documentado: Snackbar warning accuracy, **sin** POST complete.
- [ ] Si accuracy OK / null-unknown y lejos del pin: sigue TOO_FAR + distanceMeters (pack 1).
- [ ] Pack 1 smoke sigue: refresh GPS + timeout 15s + coords locked.
- [ ] Dual-OS; HARD STOP EAS.
- [ ] Tests helper/store verdes.
- [ ] 1 issue = 1 branch = 1 PR; no pack 3.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
git fetch origin main && git checkout -B fix/driver-complete-gps-accuracy-gate origin/main
# … implement …
bun --filter @lifty/mobile test   # o jest scoped al store/location si aplica
bun --filter @lifty/mobile exec tsc --noEmit
# si tocás BE:
bun --filter @lifty/backend test
bun run lint   # o biome scoped a archivos tocados
```

Smoke Expo Go conductor: in_trip cerca pin con GPS bueno → FINALIZAR OK; simular/forzar accuracy alta en __DEV__ o condición indoor → copy impreciso sin TOO_FAR genérico.

## Entrega

1. Commits conventional, **subject-case** commitlint (evitar Start Case en subject):  
   `fix(mobile): gate trip complete on gps accuracy before too-far`
2. **No** `git add -A` — solo archivos del fix (+ este handoff si ya está en la branch).
3. PR a `main` con summary + root cause 3–5 líneas + test plan + link ClickUp.
4. Post-create: `gh pr comment <N> --body '/review'`
5. Comment en ClickUp con PR URL + branch.
6. **Complete CU solo después del merge** a main (comment SHA). No complete pre-merge.
7. No secrets, no APKs, no drive-by refactors.

## Anti-scope siblings

- Pack 3 `1dfc7p9x8fu` metros UI
- #550 TripComplete collect center (STALE)
- #552 pax swipe-back (STALE)
- #553 driver marker stuck pickup
- Cancel-rate #492 engine
- Map chrome attribution
