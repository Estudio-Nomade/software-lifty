# Fix: driver login “backend no conectado” + welcome/crear cuenta loading loop

## Repo
- Path: `/home/marti/Documentos/LIfty/software-lifty`
- App: **solo** `apps/mobile` (conductor)
- Base: `origin/main` (traer lo último; **no** asumir que la WIP local ya está mergeada)
- Branch nueva: `fix/driver-login-network-welcome-loop`
- No tocar: `apps/mobile-passengers`, `apps/backend` (salvo evidencia dura de CORS server-side y el humano lo pide), admin, web-transito
- Conventional commits. PR a `main` al final.
- **No** secrets en commits. No pegar `.env`. No `git add -A` con basura local (`.hermes/`, etc.).

## Síntoma (palabras del usuario)
1. Quiere **iniciar sesión** y la app dice que el **backend no está conectado**.
2. Vuelve atrás para **crear cuenta** y se queda **colgado cargando** (loop / spinner eterno).

Copy real del cliente (axios), **no inventar otro texto**:
```
Sin conexion. Verifica que el backend este corriendo y tu internet funcione.
```
Fuente: `apps/mobile/src/api/client.ts` → `ERR_NETWORK` / timeout / canceled → `NETWORK_ERROR`.

## Contexto de lab (2026-09-22/23) — no confundir islas
- Mobile apunta a **Railway** vía `apps/mobile/.env.local` → `EXPO_PUBLIC_API_URL=https://liftybackend-production.up.railway.app/api` (prioridad sobre port local).
- Railway `/health` suele estar **ok** (`database/redis/supabase connected`).
- Local `:3001` puede spamear `[searchTimeout]` / `[CLEANUP]` Failed query; **no es la API que usa el mobile** si `.env.local` es Railway. No “arreglar PG local” como causa del login web.
- Expo Go iOS **SDK 57** vs proyecto **SDK 54** → QR nativo roto. Lab real = **Expo web**:
  - `http://127.0.0.1:8081` o `http://192.168.1.7:8081` (WLAN actual; **nunca** `https://`)
  - Metro: `curl -sS http://127.0.0.1:8081/status` → `packager-status:running`
- Supabase canónica Auth/DB: **`wabddbkwugepkwrgzhpk`**. Legacy `dlqvos…` no es el monorepo.
- WIP local en otra rama (`fix/driver-unauth-welcome-onboarding` / cold-open Paso 1/3) **puede estar dirty**. Este ticket es **otro bug** (login network + spinner welcome). No mergear a ciegas esa WIP. Si hace falta código de gate unauth/welcome, re-aplicar **quirúrgico** desde main o cherry-pick consciente.

## Arquitectura (no reinventar)
Login conductor **no** es “un solo POST al backend”:

| Paso | Quién | Dónde |
|------|--------|--------|
| 1 Email/password | **Supabase Auth** `signInWithPassword` | `hooks/useAuth.ts` → `useLogin` |
| 2 Guardar token en zustand | `setSession(access_token, userId)` | `LoginCredentialsScreen.handleLogin` |
| 3 Estado conductor | **Backend** `GET /api/drivers/me/status` | `apiClient` (axios baseURL = `EXPO_PUBLIC_API_URL`) |
| 4 Navegar | `routeForDriverStatus` / Terms | `postAuthRouting.ts` |

Registro:
- `useSignUp` = Supabase `signUp` (OTP mail = Auth SMTP, **no** Resend del backend).
- Si hay sesión inmediata o post-verify → otra vez `resolvePostAuthRoute()` → **mismo** `GET /drivers/me/status`.

Mensaje “backend no conectado” en la práctica es casi siempre el **paso 3** (o cualquier `apiClient` call) con `ERR_NETWORK`, **aunque** Supabase Auth haya respondido 200. El copy es engañoso: en **browser** incluye **CORS bloqueado**, API URL mal bakeada, mixed content, offline — no solo “process down”.

## Causa raíz candidata del LOOP (alta prioridad — leer el código)
`WelcomeScreen`:
```ts
const waitingForRoute = isAuthenticated && driverStatus == null && onboardingStep == null;
if (loading || !sessionRestored || waitingForRoute) {
  return <LoadingOverlay visible />;
}
```

Secuencia típica del bug reportado:
1. Login: Supabase OK → `setSession` → `isAuthenticated=true`.
2. `GET /drivers/me/status` falla con `ERR_NETWORK` → error en pantalla login (“Sin conexion…”).
3. Usuario toca **Volver** → welcome.
4. Store sigue autenticado, `driverStatus` y `onboardingStep` siguen **null**.
5. `waitingForRoute === true` → **spinner eterno** en welcome.
6. “Crear cuenta” puede sentirse colgado porque welcome nunca muestra botones, o porque `RegisterScreen` también hace `if (loading) return <LoadingOverlay />` con `useAuth().loading`, o post-auth otra vez pega al API muerto.

`AuthRedirectWatcher` (rama authenticated + null/null):
```ts
if (onboardingStep == null && driverStatus == null) {
  if (onStepGated) router.replace('/');
  return; // en welcome/register: NO desbloquea ni limpia sesión
}
```
O sea: **no hay escape** del estado “sesión sí, status nunca llegó” en public entry.

Esto es independiente de (pero compatible con) el trabajo Paso 1/3 cold-open.

## Hipótesis rankeadas (medir con evidencia antes de PR grosso)

### A — CORS / Origin web vs Railway (muy frecuente en lab browser)
- Browser Origin `http://127.0.0.1:8081` a veces ya tiene `Access-Control-Allow-Origin`.
- Origin **`http://192.168.1.7:8081`** (LAN) puede **no** estar en `CORS_ORIGIN` de Railway → preflight falla → axios `ERR_NETWORK` → mismo copy de “backend no corriendo”.
- Probe (humano/peer sin pegar secrets):
  ```bash
  curl -sS -D- -o /dev/null -X OPTIONS \
    "https://liftybackend-production.up.railway.app/api/drivers/me/status" \
    -H "Origin: http://192.168.1.7:8081" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,content-type"
  ```
  Debe devolver Allow-Origin **exacto** al Origin. Si no → ops Railway Variables (no es “código login” solo).
- También probar `http://localhost:8081` y `http://127.0.0.1:8081`.
- **Native Expo Go no usa CORS**; si el reporte es solo web, no “arreglar” Auth primero.

### B — `EXPO_PUBLIC_API_URL` no bakeada en el bundle Metro
- `getApiUrl()` lee env **al load del módulo**. Si Metro arrancó sin `.env.local` o sin restart tras editar, cae a `http://<pageHost>:3001/api` o localhost.
- Verify en consola web: log `__DEV__` `[API] Backend URL: …` debe ser Railway `…/api`.
- Si apunta a `:3001` y no hay API local usable → ERR_NETWORK real.

### C — Auth OK + status fail sin recovery UX (bug de producto/código **sí o sí a endurecer**)
Aunque A/B se arreglen en ops, el cliente **no debe**:
- dejar `isAuthenticated` + null/null y pintar spinner forever en welcome;
- ni mentir “backend no conectado” sin distinguir CORS / 401 / 5xx / timeout.

### D — Supabase session half-set + goBack
`handleLogin` setea sesión **antes** del GET status. Si status falla, la sesión queda. Volver atrás = welcome waitingForRoute. Fix de flujo, no solo copy.

### E — No es el bug de OTP mail / Resend
No perseguir “email no llega” ni `SEND_EMAILS_IN_DEV` acá. Login password + status API.

### F — No es Expo Go SDK 57 como causa del copy de red
SDK mismatch impide abrir nativo; el síntoma de red+loop es del **flujo auth/API en la shell que sí abre** (web). Mencionar SDK solo si el peer no puede reproducir.

## Archivos clave (leer antes de editar)
- `apps/mobile/src/api/client.ts` — `getApiUrl`, `ERR_NETWORK` copy
- `apps/mobile/src/screens/LoginCredentialsScreen.tsx` — `handleLogin` setSession + status
- `apps/mobile/src/screens/WelcomeScreen.tsx` — `waitingForRoute` + LoadingOverlay
- `apps/mobile/src/screens/RegisterScreen.tsx` — loading gate + `resolvePostAuthRoute`
- `apps/mobile/src/hooks/useAuth.ts` — `useLogin` / `useSignUp` (Supabase only)
- `apps/mobile/src/lib/postAuthRouting.ts` — status + catch → OnboardingStep1
- `apps/mobile/src/components/AuthRedirectWatcher.tsx` — null/null + public entry
- `apps/mobile/src/components/AppInitializer.tsx` — SessionRestore status
- `apps/mobile/src/store/authStore.ts` — session / clearAuth / no persist token (v1)
- `apps/mobile/src/lib/authRouteGate.ts` — rutas sin sesión
- Tests existentes: `src/__tests__/**` session-restore, authRedirectRoutes, postAuthRouting, authStore

## Qué hacer (orden)

### 0) Reproducir con evidencia (obligatorio)
1. `cd /home/marti/Documentos/LIfty/software-lifty && git fetch origin && git checkout -b fix/driver-login-network-welcome-loop origin/main`
2. Confirmar Metro + web: `bun run dev:driver` o `:web`; abrir **http://127.0.0.1:8081** (y si el user usa LAN, **también** `http://<wlan0-ip>:8081`).
3. DevTools → Console: anotar `[API] Backend URL:`.
4. Network: login → ver si falla OPTIONS/GET a Railway o a `:3001`; status code / CORS error en consola.
5. Tras error de login, Volver → ¿spinner welcome? Loguear snapshot mental: `isAuthenticated`, `driverStatus`, `onboardingStep`, `sessionRestored` (breakpoints o logs temporales `__DEV__`).

Clasificar:
- **Infra/CORS/URL** (A/B) vs **solo UX recovery** (C/D) vs ambos.
- Si es solo CORS LAN: documentar en PR el `CORS_ORIGIN` faltante; el código igual debe salir del spinner (C/D). Ops Railway puede ser del humano si el peer no tiene acceso — el PR de mobile no se bloquea por eso.

### 1) Fix mínimo de producto (código — KISS)
Objetivo: **nunca** spinner infinito en welcome/register por “auth sí, status no”.

Opciones aceptables (elegir la más chica que pase aceptación; no reescribir auth):

**Preferida (combinable):**
1. **LoginCredentialsScreen** (y paths Google/OTP que llamen status): si Auth OK y `GET /drivers/me/status` falla por red:
   - mensaje claro (ej. “No pudimos hablar con el servidor de Lifty. Revisá conexión / API.”) **sin** mentir genérico si se puede distinguir;
   - **no** dejar al usuario en limbo: o bien `signOut` + clear store y quedarse en login con error, o bien botón Reintentar status **sin** matar sesión, pero **welcome no puede depender de null/null forever**.
2. **WelcomeScreen**: si `isAuthenticated && driverStatus==null && onboardingStep==null` **después** de `sessionRestored`:
   - no spinner eterno: UI de “Reintentar cargar cuenta” / “Cerrar sesión” / timeout corto (ej. 2–3s) y fallback guest o error;
   - o disparar un retry de status una vez y luego escape.
3. **AuthRedirectWatcher**: estado authenticated + null/null en public entry no es “OK quedarse callado”. O deja pasar welcome con CTAs de recovery, o manda a login con flag, o fuerza sign-out controlado. **No** `router.replace('/')` en loop.
4. **Register**: no full-screen block eterno por el mismo null/null; al volver de login fallido status, debe verse el form o recovery.

**Copy `ERR_NETWORK`:** opcional mejorar a “No hay respuesta del API (red o CORS). URL: …” solo en `__DEV__`. No spamear URL en prod.

**No** hacer upgrade Expo 57 en este PR.  
**No** tocar passenger salvo copy compartido imposible (no lo es).  
**No** “fix” inventando mock status approved.

### 2) Tests
- Unit: welcome / gate — authenticated + null status + sessionRestored → **no** queda locked loading sin escape (estado observable o helper extraído).
- Login flow: status network fail no deja store en callejón sin salida (clearAuth o retry flag).
- No romper tests de cold-open / unauth welcome (`authRedirectRoutes`, session-restore).
- Jest green **no alcanza**: smoke browser obligatorio en el PR body.

### 3) Verify
```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /home/marti/Documentos/LIfty/software-lifty
# tests scoped mobile
bun --filter @lifty/mobile test -- --testPathPattern='(auth|session-restore|postAuthRouting|Welcome|Login)'
cd apps/mobile && bunx tsc --noEmit
# desde root si aplica
bun run lint
```
Manual smoke (PR description):
1. Ventana privada `http://127.0.0.1:8081` → welcome con botones (no spinner eterno).
2. Login con user real de lab: si API OK → sale de login al step correcto; si API cortada (DevTools block o URL mala) → error visible y **Volver** muestra welcome usable o recovery, **nunca** loop loading.
3. CREAR CUENTA muestra form (no spinner eterno).
4. Console `[API] Backend URL` = Railway cuando `.env.local` lo dice.
5. Si se usó `http://192.168.1.7:8081`, repetir smoke; si CORS falla, anotar Origin faltante para Railway.

### 4) Entrega
- PR a `main`: título tipo `fix(mobile): recover driver welcome when status API fails after login`
- Body: root cause 3–5 líneas + evidencia Network + test plan smoke
- Commits conventional, un concern

## Anti-scope
- No SDK 54→57
- No backend feature nuevo
- No admin/tránsito
- No reabrir Paso 1/3 cold-open salvo cherry-pick mínimo si main aún no tiene gate unauth
- No secrets, no rotar passwords staff
- No matar Railway “porque local CLEANUP falla”

## Criterios de aceptación
- [ ] Login fallido por red/CORS no deja welcome en LoadingOverlay infinito
- [ ] Tras ese fallo, CREAR CUENTA / welcome son usables (form o recovery explícito)
- [ ] Si la API está sana y CORS OK, login sigue ruteando por `/drivers/me/status` como hoy
- [ ] Console muestra API URL esperada en dev
- [ ] Tests scoped + tsc; smoke browser documentado
- [ ] PR sin archivos ajenos

## Notas ops (si A confirma CORS LAN)
Pedir al humano con acceso Railway sumar a `CORS_ORIGIN` (lista existente +):
`http://127.0.0.1:8081,http://localhost:8081,http://192.168.1.7:8081`
(y el LAN real si cambia). Redeploy. Probe OPTIONS otra vez. El fix de UX mobile **igual** se mergea.
