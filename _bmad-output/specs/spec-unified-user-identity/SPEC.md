---
id: SPEC-unified-user-identity
companions:
  - data-model.md
  - architecture-spine.md
sources:
  - _bmad-output/architecture/architecture-software-lifty-2026-08-11/ARCHITECTURE-SPINE.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only.

# Unified User Identity — Driver + Passenger

## Why

**Opportunity + pain to solve.** Un usuario Lifty es una persona que puede querer conducir Y viajar. Hoy la arquitectura fuerza un solo rol por usuario: la tabla `users` tiene un `varchar role` que `findOrCreateUser` hardcodea a `'driver'`. Si un conductor se baja de su auto y quiere pedir un viaje como pasajero, no puede — o necesita otra cuenta. Ambas apps comparten el mismo proyecto Supabase (`wabddbkwugepkwrgzhpk`), así que duplicar identidades no tiene sentido. La app de pasajeros está en desarrollo activo — este es el momento de arreglar la base antes de que el problema se agrave.

## Capabilities

- **CAP-1 — User identity exists independently of role**
  - **intent:** Un usuario de Supabase Auth se convierte en un `users` row sin que se le asigne un rol al momento de creación. La identidad es el usuario; los roles vienen después.
  - **success:** `findOrCreateUser` inserta un `users` row con `id`, `email`, `phone` y ningún campo de rol asignado. Un test de integración crea un usuario nuevo vía auth y verifica que no tiene `role` seteado.

- **CAP-2 — Passenger profile creation**
  - **intent:** Un pasajero que completa el registro (nombre, apellido, términos aceptados, email verificado) obtiene un `passenger_profiles` row vinculado a su `users.id`.
  - **success:** Test E2E: Register → Terms → LoginCredentials → email+password → se crea `passenger_profiles` row con `user_id` correcto. La app redirige al Home.

- **CAP-3 — Driver profile remains unchanged**
  - **intent:** El flujo de registro de conductor (existente) sigue funcionando exactamente igual. `DriversService.updateProfile()` crea el `drivers` row en el primer update.
  - **success:** Todos los tests existentes del conductor pasan sin modificaciones. El `drivers` table y sus relaciones (vehicles, documents, locations) no se alteran.

- **CAP-4 — Dual-role user**
  - **intent:** Un usuario con ambos perfiles (driver + passenger) puede usar cualquiera de las dos apps con la misma cuenta Supabase. Al iniciar sesión en la app de pasajeros, se reconoce que ya existe y se le permite continuar.
  - **success:** Test: crear usuario vía driver app (→ driver profile), luego iniciar sesión en passenger app → se reconoce al usuario existente → se permite registro de pasajero → ambos perfiles coexisten. `GET /auth/me` devuelve `role: 'both'`.

- **CAP-5 — Role derivation, not storage**
  - **intent:** El `role` que ve el código (middleware, endpoints) se computa en tiempo de lectura a partir de los perfiles existentes, no de una columna estática.
  - **success:** Test unitario de `deriveRole(userId)`: sin perfiles → `null`, solo driver → `'driver'`, solo passenger → `'passenger'`, ambos → `'both'`.

- **CAP-6 — Backward-compatible authorization**
  - **intent:** Todo código existente que chequea `user.role === 'driver'` o usa `requireRole('driver')` sigue funcionando sin cambios.
  - **success:** Test de regresión: todos los endpoints existentes del driver (49+) pasan con la nueva lógica de derivación de rol. `requireRole(['driver'])` acepta usuarios con rol derivado `'driver'` y `'both'`.

## Constraints

- **Mismo proyecto Supabase.** Ambas apps comparten `wabddbkwugepkwrgzhpk`. No se puede crear un segundo proyecto.
- **Tabla `drivers` existente.** 1:1 con `users` vía `user_id UNIQUE FK`. No se borra ni se migra su estructura core.
- **Driver app no se rompe.** Cualquier cambio en el backend no debe requerir cambios en `apps/mobile` para seguir funcionando.
- **`trips.passenger_id` es un UUID sin FK.** Hoy acepta cualquier `users.id`. La migración no debe romper trips existentes.
- **Una sola cuenta Supabase por email.** `signUp` con un email ya registrado falla. La passenger app debe manejar este caso (→ `signIn` en vez de `signUp`).

## Non-goals

- **Profile switching UX in-app.** Cómo un usuario dual-role cambia entre modo conductor y pasajero DENTRO de la misma app. Esto es diseño de UX futuro.
- **Unificar las apps en una sola.** Driver y passenger siguen siendo apps separadas (`apps/mobile` y `apps/mobile-passengers`).
- **Migración de datos de passengers existentes.** No hay passengers en producción — es greenfield para ese perfil.
- **Eliminar la columna `users.role`.** Se mantiene como caché durante la transición. Su remoción es deferred.

## Success signal

Un developer crea una cuenta con email+password desde la passenger app, completa el registro, y ve el Home. Luego abre la driver app, inicia sesión con el mismo email, completa el onboarding de conductor, y ve su dashboard. `GET /auth/me` devuelve `role: 'both'`. Ningún test del driver falla.

## Assumptions

- Supabase Auth está configurado con `shouldCreateUser: true` para `signInWithOtp` en ambas apps.
- El email de verificación de Supabase usa Resend SMTP (ya configurado en el dashboard).
- La passenger app seguirá usando `signInWithPassword` y `signInWithGoogle` (flujo actual).
- El `AuthUser` interface del backend (`{ id, role, email, phone }`) puede extenderse sin romper consumidores.
- No hay usuarios `admin` que también necesiten ser passengers (caso de uso interno solamente).

## Open Questions

- ¿El `role: 'both'` debería ser un string o un array `['driver', 'passenger']` en el response de `/auth/me`?
- ¿Qué pasa si un usuario con `role: 'driver'` intenta registrarse como passenger con `signUp`? ¿Manejamos el error `User already registered` en el frontend o en el backend?
- ¿Necesitamos un endpoint `POST /auth/set-role` o los roles se derivan exclusivamente de los perfiles?
