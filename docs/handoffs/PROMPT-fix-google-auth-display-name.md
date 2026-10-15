# fix: nombre Google basura + modal “Editar perfil” atrapa (conductor y pasajero)

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
Apps: `apps/backend` + `apps/mobile` + `apps/mobile-passengers`  
Base: `origin/main` limpio  
Branch: `fix/google-auth-display-name`  
(Si el PR se pone gordo, podés split: (A) auth name SoT backend/clients (B) edit-profile sheet dismiss UX — **mismo issue product**, preferible **un PR** si el diff cabe.)  
No tocar: Play Console, EAS build, OAuth client IDs/secrets, admin panel (salvo lectura).  
Conventional commits. PR a `main`.  
gh: **`martiyaquinta`**.

---

## Síntoma (usuario) — dos caras del mismo dolor

### A) Nombre mal tomado de Google
Cuenta Google: `martinayaquinta2017@gmail.com`  
En conductor **y** pasajero el nombre aparece como **“Martin Transito”** / **“Martin TRansito”**, y **no es el nombre real**.

### B) Modal “Editar perfil” te encierra (ambas apps)
> Si quiero editar el perfil, tanto en conductor como pasajero, sí o sí tengo que editar y poner **Guardar** para poder salir de la sección “Editar perfil”. Agregale un scroll para que lo pueda **swepear para abajo** y que se salga también.

En la práctica el usuario se siente **atrapado** en el sheet/modal: no puede cancelar/descartar con gesto; solo “completar y Guardar” (o un close que no descubre / no anda bien en device).

No es solo cosmético: sin salida fácil no pueden corregir el nombre basura de Google.

---

## Criterios de aceptación

### Nombre / Google
- [ ] Explicar con evidencia de dónde sale el string (Google metadata vs DB vs store).
- [ ] Nuevo login/registro con Google **no** deja al usuario atrapado con un display name basura de la cuenta Google sin poder corregirlo.
- [ ] Si el usuario ya cargó nombre en el flujo de registro Lifty (draft nombre+apellido) **antes** de Google, ese nombre gana sobre el de Google al crear/backfill.
- [ ] Tras Google, si el nombre viene solo de Google, la app ofrece **confirmar/editar nombre** (o al menos el perfil editar nombre funciona y pisa `users.full_name` + lo que lea la UI).
- [ ] Conductor y pasajero muestran el mismo SoT de nombre de `users.full_name` (no uno lee solo metadata cruda para siempre).
- [ ] Documentar fix ops para la cuenta ya contaminada (`martinayaquinta2017@gmail.com`) — SQL/admin/profile edit — **sin** pegar secrets en el PR.
- [ ] Tests backend del helper de nombre + smoke manual Google o mock metadata.
- [ ] No romper OAuth redirect / PKCE.

### Modal Editar perfil (conductor + pasajero) — **obligatorio en este mismo handoff**
- [ ] Se puede **salir sin Guardar** (cancelar / cerrar) en **ambas** apps.
- [ ] Gesture: **swipe down** (arrastrar el sheet hacia abajo) cierra el modal **sin** persistir cambios.
- [ ] Tap en **backdrop/overlay** oscuro cierra sin guardar (si el diseño es modal bottom-sheet).
- [ ] Control explícito visible: **X** y/o texto **Cancelar** (además del gesto) — hit target ≥44px.
- [ ] **Guardar** sigue guardando y cerrando; si hay error de red, el modal **no** se traba eterno (loading off + mensaje).
- [ ] Si el teclado está abierto, swipe/close igual funciona (no pelear con KeyboardAvoidingView).
- [ ] Mismo patrón UX en `apps/mobile` y `apps/mobile-passengers` (no arreglar solo una).
- [ ] Smoke: abrir Editar perfil → swipe down → volvés al Perfil; abrir → X → volvés; abrir → cambiar nombre → Guardar → nombre nuevo en header.

---

## Root cause class (confirmar midiendo, no re-debatir)

### Cadena actual

1. Usuario toca **Continuar con Google**.
2. Supabase Auth devuelve `user.user_metadata` poblado por Google.
3. Google suele mandar campos tipo:
   - `name` / `full_name` → a menudo el **nombre del perfil de Google** (puede ser apodo, “Martin Transito”, etc.)
   - a veces `given_name`, `family_name`
4. Backend `findOrCreateUser` (`apps/backend/src/shared/middleware/auth.ts`):

```ts
function metadataFullName(supabaseUser) {
  meta.full_name || meta.name  // trim
}
// insert users.full_name = fullName
// o maybeBackfillFullName si DB full_name vacío
```

5. Passenger client `AuthContext.syncStore` usa **solo**:

```ts
(metadata?.full_name as string) ?? undefined
```

   (ni siquiera `metadata.name` — inconsistente con backend).

6. UI Perfil lee store / `GET profile` → muestra ese `full_name`.

### Por qué “Martin Transito”

No lo inventa Lifty: **viene del display name de la cuenta Google** (o metadata Auth ya guardada).  
Lifty lo **copia una vez** a `public.users.full_name` y después lo reusa en conductor y pasajero (misma fila `users` por email/id).

Por eso se ve **en las dos apps**.

### Qué NO es

- No es el package name ni Play listing.
- No es el TabBar loop.
- No es Resend / Railway per se.
- No “arreglar” borrando el provider Google.

---

## Archivos clave

| Path | Rol |
|------|-----|
| `apps/backend/src/shared/middleware/auth.ts` | `metadataFullName`, `maybeBackfillFullName`, `findOrCreateUser` |
| `apps/backend/src/features/auth/service.ts` | `GET /auth/me` expone `full_name` |
| `apps/backend/src/features/passengers/*` | register/profile update `full_name` |
| `apps/backend/src/features/drivers/service.ts` | onboarding first/last → `users.full_name` |
| `apps/mobile-passengers/src/context/AuthContext.tsx` | syncStore desde metadata |
| `apps/mobile/src/context/AuthContext.tsx` | equivalente conductor |
| `apps/mobile-passengers/src/store/authStore.ts` | `fullName` persistido |
| `apps/mobile-passengers/src/store/registrationDraftStore.ts` | nombre tipeado pre-Google |
| `apps/mobile-passengers/src/screens/RegisterScreen.tsx` | setFullName draft + Google (exige TyC) |
| `apps/mobile-passengers/src/screens/ProfileScreen.tsx` | display + **Modal Editar perfil** (pax) |
| `apps/mobile/src/screens/ProfileScreen.tsx` | display + **Modal Editar perfil** (conductor) + onboarding nombre |
| `apps/mobile*/src/lib/socialAuth.ts` | OAuth (no cambiar redirect salvo bug probado) |
| `apps/mobile/src/components/BottomSheet.tsx` + `bottomSheetMath.ts` | patrón sheet/gesto ya usado en home conductor — **reusar idea**, no copiar ciego APIs |

Leer también ref pitfall nombre pasajero en viajes:  
`~/.hermes/skills/software-development/lifty-dev-pitfalls/references/driver-passenger-name-display.md`  
(clase distinta pero mismo SoT `users.full_name`).

---

## Hipótesis / trabajo (orden)

### A) Datos ya malos (cuenta concreta) — ops + product path

1. Probar en SQL/REST (proyecto **wabdd**):  
   `users.email = martinayaquinta2017@gmail.com` → `full_name`.  
   Auth user metadata en Dashboard → User → raw `user_metadata`.
2. Si `users.full_name = 'Martin Transito'` → confirmar copy desde Google.
3. Fix inmediato usuario (documentar en PR, no hardcode email en código):
   - Editar nombre en **Perfil pasajero** (ya hay PUT profile), **o**
   - Conductor onboarding/perfil first+last que pisa `full_name`, **o**
   - SQL ops una vez (solo runbook, no migración one-off en repo salvo seed test).

### B) Product fix (código) — para que no vuelva a pasar

Prioridad KISS, combinar lo necesario:

1. **Helper único de display name** (backend + opcional shared comment en clients):
   - Preferir, en orden:
     1. Nombre **explícito Lifty** ya en DB (`users.full_name` no vacío) — **nunca pisar** con Google en backfill si ya hay valor humano/editado.
     2. Draft de registro (`fullName` del store) pasado al backend en el primer `register` / endpoint post-OAuth.
     3. `given_name + family_name` de metadata si ambos existen y se ven “persona real”.
     4. `full_name` / `name` de Google como **último** fallback.
   - Hoy `maybeBackfillFullName` ya no pisa si hay `currentName` — bien. El problema es el **primer** insert con basura Google.

2. **Post-Google name gate (recomendado UX):**  
   Tras `signInWithGoogle` exitoso, si no hay draft name y el metadata name es el único source:
   - Pasajero: pantalla/modal “¿Cómo te llamás?” antes de home, o forzar completar en register flow.
   - Conductor: ya tiene onboarding step1 nombre — asegurar que **siempre** pise `users.full_name` y que la UI no se quede pegada al metadata de AuthContext.

3. **Client syncStore:**  
   No preferir solo `metadata.full_name` para siempre.  
   Tras login: `GET /auth/me` o profile y setear `fullName` desde **API/DB**.  
   Metadata solo fallback flash inicial.

4. **Register + Google (pasajero):**  
   Hoy Register pide nombre+apellido para email path y setea draft; Google path exige TyC pero **¿persiste el draft al backend?** Verificar `registerPassenger(fullName)` se llama post-Google. Si no → **bug**: Google crea user con metadata name e ignora lo tipeado.

5. **No** usar email local-part (`martinayaquinta2017`) como display salvo empty state.

### C) Modal “Editar perfil” atrapa — AS-IS y fix UX (ambas apps)

**AS-IS (leer el JSX real):**

- Pasajero: `ProfileScreen` → `<Modal visible={editVisible} animationType="slide" transparent>` + header título + **TouchableOpacity X** (`setEditVisible(false)`) + `ScrollView` interno + **Guardar**.
- Conductor: misma forma en `apps/mobile/src/screens/ProfileScreen.tsx` (X + Guardar).

O sea: en código **ya hay una X**. El reclamo del usuario (“solo salgo si Guardo” + pide **swipe down**) implica una o más de:

1. La X es **poco visible** / hit target chico / color gray sobre gray.
2. El modal **no es un bottom-sheet dismissible**: no hay pan gesture → no se puede “swepear para abajo”.
3. El `ScrollView` interno **come el gesto** vertical → el user intenta swipe-dismiss y solo scrollea el form.
4. En Android el back hardware / tap fuera no cierra (`onRequestClose` / backdrop press faltantes o rotos).
5. Teclado + `KeyboardAvoidingView` deja el sheet a pantalla casi full → se siente full-screen trap sin affordance de dismiss.

**Product lock (Marti):**

- Salir **sin** guardar = obligatorio.
- **Swipe down para cerrar** = obligatorio (gesto natural de sheet).
- Guardar = opcional path de persistencia, no el único escape.

**Fix class (KISS, parity conductor+pasajero):**

1. Convertir el modal de edición en **bottom sheet** dismissible **o** envolver el sheet actual con pan-to-dismiss:
   - Handle (pill) visible arriba del título.
   - Drag down past threshold → `setEditVisible(false)` y reset draft fields (no PATCH).
   - Prefer reusar patrones de `BottomSheet` del conductor home si encajan; si no, `react-native-gesture-handler` + `reanimated` ya en el monorepo Expo, o Modal + translateY. **No** meter lib nueva si se puede evitar.
2. Backdrop press → close without save.
3. Android: `Modal` `onRequestClose` → same close without save.
4. X / **Cancelar** grandes y obvios (no solo icono gray 24px escondido).
5. Scroll del form **dentro** del sheet: el pan de dismiss vive en el **header/handle**; el `ScrollView` solo scrollea contenido. Si el form es corto, swipe en toda la card puede dismiss. Si hay conflicto scroll vs dismiss, prioridad: handle + header siempre dismiss; scroll solo cuando contentOffset > 0.
6. Al cerrar sin guardar: descartar `editPhotoUri` / campos locales (ya se rehidratan en `openEdit`).
7. **No** exigir “editar un campo” para habilitar cerrar.

**No hacer:** full-screen wizard nuevo de perfil; ni unir edit profile con onboarding docs.

### D) Tests

- Unit `metadataFullName` / resolveDisplayName con fixtures:
  - solo `name: "Martin Transito"`
  - `given_name`+`family_name`
  - DB ya tiene “Martina Yaquinta” → Google no pisa
  - draft “Martina Y.” gana en create path (si implementás endpoint)
- passengers.test profile update ya existe — extender si hace falta.
- UI: si hay tests de screen, al menos helper de “shouldDismissSheet” / threshold; smoke manual obligatorio del swipe en **ambas** apps.

---

## Qué hacer (pasos agente)

1. Branch desde `origin/main`.
2. Repro mental + leer auth middleware + passenger Register Google path + **ambos** Profile modals.
3. Confirmar si post-Google se llama register/profile con draft name (grep call sites).
4. Implementar:
   - (A) fix nombre SoT / no overwrite basura Google
   - (B) **edit-profile dismiss UX** en conductor + pasajero (swipe down + backdrop + X/Cancelar + onRequestClose)
5. Runbook corto en descripción PR para limpiar la cuenta ya afectada (Profile edit o SQL wabdd — el humano ejecuta SQL si hace falta).
6. Verify:
   ```bash
   export PATH="$HOME/.bun/bin:$PATH"
   cd /home/marti/Documentos/LIfty/software-lifty
   bun --filter @lifty/backend test src/shared/middleware/  # o tests que agregues
   bun --filter @lifty/backend test src/features/passengers/
   bunx biome check <files touched>
   bun run typecheck
   # smoke:
   # bun run dev:driver  → Perfil → Editar → swipe down cierra
   # bun run dev:passenger → igual
   ```
7. Commit(s) ej:
   - `fix(auth): prefer lifty name over google profile display name`
   - `fix(mobile): dismiss edit-profile sheet without forcing save`
   (o un solo commit si el diff es chico: `fix(mobile): google display name + edit profile dismiss`)
8. PR a main con root cause 3–5 líneas + test plan (nombre **y** swipe dismiss ×2 apps).

---

## Anti-scope

- No reconfigurar Google Cloud OAuth clients / SHA-1 (otro hilo).
- No “borrar usuarios” masivo en prod.
- No cambiar package/slug/scheme.
- No TabBar loop (handoff aparte: `PROMPT-fix-driver-tabbar-stack-loop.md`).
- No inventar second `users` row por app (conductor y pasajero comparten Auth user).
- No rediseñar todo Perfil / no meter settings nuevas.
- No commitear `.env` ni dumps de metadata real con tokens.

---

## Nota para el humano (ops inmediata, sin esperar PR)

Mientras el agente codea, el usuario puede **editar el nombre en Perfil** (si logra salir del modal: probar la **X** arriba a la derecha del sheet).  
Eso pisa `users.full_name` y debería reflejarse en ambas apps al refrescar.  
Si la UI sigue mostrando “Martin Transito” después de editar: bug de client cache/metadata (punto B3) — el PR debe cubrirlo.  
Si no puede salir sin Guardar: exactamente el bug C — el PR debe agregar swipe-down dismiss.

---

## Entrega

- PR con causas:
  1. Google `user_metadata.name` → `users.full_name` en primer Auth touch.
  2. Modal Editar perfil sin dismiss por gesto / affordance débil → user cree que solo Guardar cierra.
- Fix: SoT DB + no confiar ciego en Google display name + sheet dismiss (swipe/backdrop/X) en **conductor y pasajero**.
- Cuenta ejemplo documentada sin secrets.
- CI green + smoke swipe en las dos apps.
