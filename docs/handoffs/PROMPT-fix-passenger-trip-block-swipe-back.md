# fix(mobile-passengers): block swipe-back during active trip screens

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
App: **solo** `apps/mobile-passengers`  
Base: `origin/main` (tip al claim — `git fetch origin main && git rev-parse origin/main`)  
Branch: `fix/passenger-trip-block-swipe-back`  
ClickUp: https://app.clickup.com/t/1dfc7p9x4r9  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Síntoma (Martina / QA)

En la app **pasajero**, durante un viaje (ej. calificar conductor / trip in progress), el **gesto swipe-back** (iOS edge swipe / Android predictive back o stack pop) saca al usuario de la pantalla de viaje y lo manda al stack anterior (suele ser Home u otra pantalla del request). Riesgo: pierde mapa/estado/calificación pendiente.

Repro:
1. Viaje en curso o pantalla de calificar (`TripComplete`).
2. Swipe desde el borde hacia el centro (o back hardware Android).
3. Sale de la pantalla de viaje.

Esperado (DoD producto CU):
- Swipe/back **no** saca por accidente de pantallas de viaje activo.
- Si sale o cierra la app, al volver **recupera** el viaje (BE = SoT).
- No se pierde calificación pendiente / estado.
- Dual-OS (gesto iOS ≠ back Android).

## Ya existe en tip (no re-greenfield recovery)

Verificar en tip antes de codear:

1. **`ActiveTripRecovery`** en `apps/mobile-passengers/src/components/AppInitializer.tsx`  
   - Cold start: `getActiveRide()` → `connecting-driver` / `trip-in-progress` / `trip-complete` según status.
2. **`HomeScreen` `useFocusEffect`**  
   - Al **focus** Home, si hay active ride → `replace` a Connecting / TripInProgress / TripComplete.  
   - Esto **mitiga** si el usuario ya cayó en Home, pero:
     - no evita el pop accidental,
     - no cubre si el swipe deja otra ruta intermedia (VehicleSelect, ConfirmPayment, etc.),
     - no bloquea hardware back en la screen de viaje.
3. **`getActiveRide` / BE `getActiveTrip`**  
   - Incluye live + `completed` no cobrado (`is_collected=false`) — rating pendiente sigue “activo”.

**Root cause rank del swipe:**
1. **CONFIRMADO tip:** expo-router `Stack` en `app/_layout.tsx` — solo `auth-callback` tiene `gestureEnabled: false`. Rutas `trip-in-progress`, `trip-complete`, `connecting-driver`, `chat` **no** deshabilitan gesto → iOS swipe pop default.
2. Android: sin `BackHandler` / sin `gestureEnabled: false` en esas screens → system back / stack back sale.
3. Navegación mixta `push` vs `replace` en el flujo request deja basura en el stack bajo el viaje → un solo back “salta” fuera del viaje aunque recovery en Home exista.
4. (Secundario) Banner “Volver a tu viaje” en Home: **no** hace falta si focus redirect ya manda al viaje; opcional polish **fuera** de este PR salvo que smoke muestre focus recovery roto.

## Scope / anti-scope

**IN (pack mínimo — este PR)**
- `apps/mobile-passengers/app/_layout.tsx` — `Stack.Screen` options:
  - `trip-in-progress` → `gestureEnabled: false` (+ `animation` estable ok)
  - `trip-complete` → `gestureEnabled: false`
  - `connecting-driver` → `gestureEnabled: false`
  - `chat` → `gestureEnabled: false` **si** el chat de viaje se abre sobre el stack de viaje (mismo riesgo). Si Chat también se usa fuera de viaje y necesitás back, documentá: disable solo cuando hay `activeTrip` vía screen options dinámicas o dejar disable siempre (Chat pax es de viaje en la práctica).
- Pantallas (hardware back Android + edge cases):
  - `TripInProgressScreen.tsx`
  - `TripCompleteScreen.tsx`
  - `ConnectingDriverScreen.tsx` (opcional: back = cancel flow ya existe; **no** pop silencioso a Home sin el path de cancel)
  - Patrón: `BackHandler.addEventListener('hardwareBackPress', () => true)` mientras montada **o** `true` que no-op / confirma. Preferí **bloquear** (return `true`) en live trip + rating; en Connecting el producto ya tiene Cancelar — back hardware puede no-op o abrir el mismo cancel (KISS: no-op block igual que iOS gesture off).
- Tests si hay harness de navigation; si no, smoke manual dual-OS.
- HARD STOP EAS.

**OUT**
- Reescribir todo el stack de request (TripRequest → …) a un solo root trip — CU idea 5 = follow-up.
- Banner Home “Volver a tu viaje” si focus recovery ya redirige (idea 4) — solo si smoke prueba que focus **no** recupera.
- Confirmar dialog “¿Salir del viaje?” (idea 2) — no en v1 si el gesto está bloqueado.
- `apps/mobile` conductor.
- Cancel-rate `1dfc7p9x4qz` / avatar marker `1dfc7p9x4r4` / WhatsApp.
- No tocar matching, map markers, collect API.
- No `git add -A`.

## Diseño de fix (KISS)

### A) Stack gestures (iOS + stack)

En `app/_layout.tsx`, además de `auth-callback`:

```tsx
<Stack.Screen name="trip-in-progress" options={{ gestureEnabled: false }} />
<Stack.Screen name="trip-complete" options={{ gestureEnabled: false }} />
<Stack.Screen name="connecting-driver" options={{ gestureEnabled: false }} />
<Stack.Screen name="chat" options={{ gestureEnabled: false }} />
```

(expo-router file routes = screen `name` kebab del archivo.)

### B) Android hardware back

En cada screen IN, `useEffect`:

```ts
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
  return () => sub.remove();
}, []);
```

`true` = evento consumido, no salir.  
TripComplete: bloquear hasta que el user termine rating/omitir por CTAs de la screen (no back).  
Connecting: bloquear silent pop; user usa UI Cancelar.

### C) Recovery (solo verificar / bugfix si roto)

1. Cold kill app mid-trip → reopen → `ActiveTripRecovery` a la screen correcta.
2. Si de algún modo cae en Home → `useFocusEffect` debe `replace` al viaje.
3. Si 2 falla en tip: fix **ahí** (no solo gesture) — p.ej. status `completed` path, race `cancelled` flag, o profile complete gate.

### D) No confiar solo en recovery

El DoD principal del CU es **no salir por accidente**. Recovery es red de seguridad.

## Archivos clave

| Path | Rol |
|------|-----|
| `apps/mobile-passengers/app/_layout.tsx` | Stack + gestureEnabled |
| `apps/mobile-passengers/app/trip-in-progress.tsx` etc. | re-exports |
| `…/screens/TripInProgressScreen.tsx` | BackHandler |
| `…/screens/TripCompleteScreen.tsx` | BackHandler + rating |
| `…/screens/ConnectingDriverScreen.tsx` | BackHandler |
| `…/screens/ChatScreen.tsx` | BackHandler si chat viaje |
| `…/components/AppInitializer.tsx` | ActiveTripRecovery (read) |
| `…/screens/HomeScreen.tsx` | focus recovery (read) |
| `…/api/passenger.ts` `getActiveRide` | SoT active |

## Verify

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /home/marti/Documentos/LIfty/software-lifty
bun --filter @lifty/mobile-passengers exec tsc --noEmit
# tests existentes trip si aplica:
cd apps/mobile-passengers && bun run test -- --testPathPattern='TripInProgress|ConnectingDriver|TripComplete' 2>/dev/null || true
```

Smoke Expo Go pasajero (Android + iOS si hay):
- [ ] TripInProgress: swipe edge **no** pop; hardware back no sale.
- [ ] TripComplete (calificar): igual.
- [ ] ConnectingDriver: gesture/back no tiran a Home sin Cancelar UI.
- [ ] Kill app mid-trip → reopen vuelve al viaje.
- [ ] (Si lográs llegar a Home con viaje vivo) focus re-entra al viaje.

## Commit / PR

Subject-case lowercase (commitlint):

`fix(passengers): block swipe and hardware back on active trip screens`

PR body:
- ClickUp https://app.clickup.com/t/1dfc7p9x4r9
- Root cause: Stack gesture default on + no BackHandler; recovery exists but does not prevent accidental exit
- Test plan checklist arriba
- `gh pr comment N --body '/review'`
- Complete CU **solo post-merge**

## Entrega

1 branch · 1 PR monorepo · no EAS · no secretos · no `git add -A`.

## Siblings Ahora (no este PR)

- Avatar conductor fijo en pickup `1dfc7p9x4r4` — location broadcast / marker
- Cancel sin conductores `1dfc7p9x4qz` — rate **#492** already excludes pre_asignacion; residual historial/UI aparte
- WhatsApp monorepo **#551** — web-Lifty residual ops si queda
