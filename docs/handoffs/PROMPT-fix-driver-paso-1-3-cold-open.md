# Fix: driver cold-open → Paso 1/3

## Síntoma
Abrir `http://192.168.x.x:8081` (o `127.0.0.1:8081`) manda a **Paso 1/3** aunque ya haya sesión / conductor approved.

## Producto esperado
- Sin sesión → **welcome** (CREAR CUENTA / INICIAR SESIÓN)
- Conductor `approved` → **home** (`/active`)
- Onboarding incompleto → pantalla del `step` real (no sticky stale URL)

## Causa raíz
1. `AuthRedirectWatcher` solo redirigía autenticados desde **public entry** (`/`, register…), no desde rutas de onboarding stale (`/onboarding-step1`).
2. Persist de zustand guardaba `token` / `driverStatus` / `onboardingStep` → race con SessionRestore.
3. Fallback `driverStatus ?? 'pending'` + default `OnboardingStep1` antes de cargar status → falso Paso 1/3.

## Branch
`fix/driver-cold-open-paso-1-3` (desde `origin/main`).

`fix/driver-unauth-welcome-onboarding` (#334) solo cubre **guest** → welcome; **no** resuelve approved + stale onboarding URL. No mergear a ciegas encima; este fix lo complementa.

## Cambios
- `AuthRedirectWatcher`: STEP_GATED_ROUTES; espera status/step; corrige onboarding stale → target del store
- `authStore`: partialize solo `termsAccepted` + `phone`; `hasHydrated`; migrate v1
- `AppInitializer` SessionRestore: espera hydrate; unwrap `data`; no guess Paso 1/3
- `postAuthRouting`: `targetScreenFromStore` + `applyDriverStatusToStore`
- Welcome: loading hasta sessionRestored / status si hay sesión
- Tests session-restore / postAuthRouting / authStore

## Verify
```bash
cd apps/mobile
bun run test -- --testPathPattern='(session-restore|authStore|postAuthRouting|authRedirectRoutes)'
bunx tsc --noEmit
```

Manual: cold open browser sin sesión → welcome; con approved + URL `/onboarding-step1` → `/active`.

## Anti-scope
Solo routing cold-open conductor. No passenger, no backend, no admin, no trip flow.
