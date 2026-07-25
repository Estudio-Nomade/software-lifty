---
id: SPEC-login-terms-flow
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Login + Terms Flow — Welcome Screen dual CTA

## Why

La WelcomeScreen tiene un solo botón "COMENZAR" que va a AuthScreen (email + OTP). Un conductor que ya tiene cuenta con contraseña no puede iniciar sesión directamente desde la pantalla principal. Además, no hay un paso explícito de aceptación de Términos y Condiciones después del registro/login.

## What changes

### WelcomeScreen — dos botones en vez de uno

Reemplazar el botón "COMENZAR" por dos CTAs:
- **"CREAR CUENTA"** → navega a `RegisterScreen`
- **"INICIAR SESIÓN"** → navega a `LoginCredentialsScreen`

Ambos botones `primary` (turquesa), ancho 327px. El texto "Al continuar aceptas los Términos y Condiciones" se mantiene debajo.

### RegisterScreen — email pre-llenado al terminar

Después de verificar el OTP con éxito, el usuario ya confirmó su email pero no tiene sesión activa. Debe iniciar sesión. En vez de navegar a `LoginCredentialsScreen` sin datos, se pasa el email como parámetro de ruta para que el campo aparezca pre-llenado. El usuario solo ingresa su contraseña.

Cambio: `navigation.replace('LoginCredentials', { email: email.trim() })`

### LoginCredentialsScreen — gate de Términos

Después del login exitoso (auth + resolución de ruta vía `routeForDriverStatus`):
- Si `termsAccepted === true` en el store → `resolvePostAuthRoute()` directo (comportamiento actual)
- Si `termsAccepted === false` → navega a `TermsScreen`

Acepta el parámetro opcional `email` para pre-llenar el campo si viene de registro.

### TermsScreen — postAuthRouting dinámico

Actualmente hardcodea `navigate('OnboardingStep1')` al aceptar. Cambia a:
1. Ejecutar `resolvePostAuthRoute()`
2. Si `blockedMessage` → mostrar error
3. Si `screen` → setear `termsAccepted: true` en el store y navegar a la pantalla resuelta

### AuthStore — nuevo campo `termsAccepted`

```typescript
termsAccepted: boolean  // default false, persistido en AsyncStorage
```

Se agrega a la lista de campos persistidos y se resetea en `clearAuth()`.

## Flow completo

```
WelcomeScreen
├── "CREAR CUENTA"
│     RegisterScreen
│       email + password + confirmar → signUp → verify OTP
│       └── LoginCredentialsScreen (email pre-llenado)
│             email + password → login
│             └── termsAccepted? ──sí──→ resolvePostAuthRoute()
│                  └── no → TermsScreen
│                             leer + "ACEPTAR Y CONTINUAR"
│                             → termsAccepted = true
│                             → resolvePostAuthRoute()
│
└── "INICIAR SESIÓN"
      LoginCredentialsScreen
        email + password → login
        └── termsAccepted? ──sí──→ resolvePostAuthRoute()
             └── no → TermsScreen
                        leer + "ACEPTAR Y CONTINUAR"
                        → termsAccepted = true
                        → resolvePostAuthRoute()
```

## Capabilities

- id: CAP-1
  intent: El usuario puede crear cuenta desde WelcomeScreen con email y contraseña, verificar su email, y aceptar Términos antes de entrar.
  success: Flujo completo: WelcomeScreen → Crear Cuenta → RegisterScreen → verify OTP → LoginCredentials → TermsScreen → aceptar → onboarding/app.

- id: CAP-2
  intent: El usuario con cuenta existente puede iniciar sesión desde WelcomeScreen con email y contraseña.
  success: Flujo completo: WelcomeScreen → Iniciar Sesión → LoginCredentials → login → TermsScreen (si primera vez) → Online/onboarding según estado.

- id: CAP-3
  intent: Los términos se muestran una sola vez. En logins posteriores se saltea y va directo a la app.
  success: Primer login → muestra Terms. Segundo login (con `termsAccepted: true`) → va directo a postAuthRouting sin mostrar Terms.

- id: CAP-4
  intent: Un conductor aprobado que inicia sesión va directo a Online (inicio), sin repetir onboarding.
  success: Login de driver aprobado → Terms (si primera vez) → Online.

## Affected files

- `apps/mobile/src/screens/WelcomeScreen.tsx`
- `apps/mobile/src/screens/RegisterScreen.tsx`
- `apps/mobile/src/screens/LoginCredentialsScreen.tsx`
- `apps/mobile/src/screens/TermsScreen.tsx`
- `apps/mobile/src/store/authStore.ts`

No se tocan archivos del backend. No se crean rutas nuevas.
