---
stepsCompleted: []
inputDocuments:
  - _bmad-output/specs/spec-unified-user-identity/SPEC.md
  - _bmad-output/specs/spec-unified-user-identity/data-model.md
  - _bmad-output/specs/spec-unified-user-identity/implementation-plan.md
  - _bmad-output/architecture/architecture-software-lifty-2026-08-11/ARCHITECTURE-SPINE.md
---

# software-lifty - Epic Breakdown: Unified User Identity

## Overview

Este documento descompone el spec de Unified User Identity en epics y stories accionables. El objetivo: permitir que un mismo usuario de Supabase Auth pueda ser conductor Y pasajero, eliminando el cuello de botella del `role` único en la tabla `users`.

## Requirements Inventory

### Functional Requirements

FR1: La tabla `users` no asigna rol al momento de creación. La identidad existe independientemente del rol.
FR2: Un pasajero que completa el registro obtiene un `passenger_profiles` row vinculado a su `users.id`.
FR3: El flujo de registro de conductor existente sigue funcionando sin cambios.
FR4: Un usuario con ambos perfiles puede usar cualquiera de las dos apps con la misma cuenta.
FR5: El `role` visible en middleware y endpoints se computa en runtime desde los perfiles existentes.
FR6: Todo código existente que chequea `user.role` o usa `requireRole` sigue funcionando.

### NonFunctional Requirements

NFR1: Los 206+ tests del backend deben pasar sin modificaciones después de los cambios.
NFR2: Ambas apps comparten el mismo proyecto Supabase — no se crea uno nuevo.
NFR3: La driver app no requiere cambios de código para seguir funcionando.

### Additional Requirements

- Crear tabla `passenger_profiles` con `user_id UNIQUE FK → users.id`
- Backfill: asegurar que cada `users` row con rol driver tenga su `drivers` row
- Función `deriveRole(userId)` en `auth.ts` que consulta ambas tablas de perfiles
- `requireRole(['driver'])` acepta usuarios con role derivado `'driver'` y `'both'`
- `findOrCreateUser` deja de insertar `role: 'driver'`
- `GET /auth/me` usa `deriveRole` para poblar el campo `role`
- `trips.passenger_id` gana FK a `passenger_profiles.user_id` (deferred a fase 2)
- Columna `users.role` se mantiene como caché denormalizada durante la transición

### UX Design Requirements

No aplica — no hay UX doc para este feature.

### FR Coverage Map

| FR | Cubierto por |
|----|-------------|
| FR1 | Epic 1 — Story 1.1, 1.2 |
| FR2 | Epic 2 — Story 2.1, 2.2 |
| FR3 | Epic 1 — Story 1.4 (regression) |
| FR4 | Epic 3 — Story 3.1 |
| FR5 | Epic 1 — Story 1.2 |
| FR6 | Epic 1 — Story 1.3, Story 1.4 |

## Epic List

1. **Epic 1: Backend Identity Foundation** — Base de datos y middleware para identidad sin rol fijo
2. **Epic 2: Passenger Profile Registration** — Registro de pasajero que crea perfil en backend
3. **Epic 3: Dual-Role Verification** — Validación end-to-end de usuario con ambos roles

## Epic 1: Backend Identity Foundation

Sentar las bases en el backend para que un usuario no tenga un rol fijo al crearse, y que el rol se derive de los perfiles existentes.

### Story 1.1: Create passenger_profiles table

As a backend developer,
I want a `passenger_profiles` table linked to `users`,
So that passenger-specific data has a home separate from driver data.

**Acceptance Criteria:**

**Given** la base de datos existente con `users` y `drivers`
**When** ejecuto la migración
**Then** existe una tabla `passenger_profiles` con columnas `id UUID PK`, `user_id UUID UNIQUE FK → users.id ON DELETE CASCADE`, `created_at`, `updated_at`
**And** el Drizzle schema está exportado desde `schema/index.ts`

### Story 1.2: Add deriveRole to auth middleware

As a backend developer,
I want the user's role computed from their profiles at request time,
So that dual-role users are correctly identified without a static column.

**Acceptance Criteria:**

**Given** un `userId`
**When** llamo a `deriveRole(userId)`
**Then** devuelve `null` si no tiene ningún perfil
**And** devuelve `'driver'` si solo tiene `drivers` row
**And** devuelve `'passenger'` si solo tiene `passenger_profiles` row
**And** devuelve `'both'` si tiene ambos

### Story 1.3: Update findOrCreateUser to not hardcode role

As a backend developer,
I want new users created without a hardcoded `role: 'driver'`,
So that passenger-only users don't get mislabeled.

**Acceptance Criteria:**

**Given** un usuario nuevo de Supabase Auth sin row en `users`
**When** `findOrCreateUser` lo crea
**Then** el INSERT no incluye `role: 'driver'`
**And** el `AuthUser` devuelto tiene `role` computado vía `deriveRole`

**Given** un usuario existente con driver profile
**When** `findOrCreateUser` lo lee
**Then** devuelve `role: 'driver'` (derivado, no almacenado)

### Story 1.4: Update requireRole for dual roles

As a backend developer,
I want `requireRole('driver')` to also accept users with `role: 'both'`,
So that dual-role users can access driver endpoints without changes.

**Acceptance Criteria:**

**Given** un usuario con `role: 'both'`
**When** accede a un endpoint protegido con `requireRole('driver')`
**Then** el middleware permite el acceso (HTTP 200)
**And** lo mismo para `requireRole('passenger')`

**Given** todos los tests existentes del backend
**When** ejecuto `bun test`
**Then** los 206+ tests pasan sin modificaciones

---

## Epic 2: Passenger Profile Registration

Crear el endpoint de registro de pasajero y conectarlo con el flujo de la app mobile.

### Story 2.1: Create passengers service and POST endpoint

As a backend developer,
I want a `POST /passenger/register` endpoint,
So that the mobile app can create a passenger profile after sign-up.

**Acceptance Criteria:**

**Given** un usuario autenticado sin passenger profile
**When** llama a `POST /passenger/register`
**Then** se crea un `passenger_profiles` row con su `user_id`
**And** devuelve HTTP 201 con los datos del perfil

**Given** un usuario que ya tiene passenger profile
**When** llama a `POST /passenger/register`
**Then** devuelve HTTP 200 con el perfil existente (idempotente)

### Story 2.2: Wire passenger registration in mobile app

As a passenger user,
I want my profile created automatically after sign-up,
So that I can start using the app immediately.

**Acceptance Criteria:**

**Given** un usuario nuevo que completa Register → Terms → LoginCredentials → signUp
**When** el signUp es exitoso
**Then** la app llama a `POST /passenger/register`
**And** el usuario es redirigido al Home

**Given** un usuario existente (ya registrado como driver) que inicia sesión en la passenger app
**When** `signUp` falla con "User already registered"
**Then** la app hace `signIn` automáticamente
**And** muestra "Ya tenés cuenta, iniciando sesión..."
**And** llama a `POST /passenger/register`
**And** redirige al Home

---

## Epic 3: Dual-Role Verification

Validar el flujo completo y asegurar que nada se rompió.

### Story 3.1: End-to-end dual-role test

As a QA engineer,
I want an automated test that creates a dual-role user,
So that we have confidence the feature works end-to-end.

**Acceptance Criteria:**

**Given** un email nuevo
**When** creo un usuario vía driver flow (→ driver profile)
**And** luego inicio sesión con el mismo email en passenger flow
**And** completo el registro de pasajero (→ passenger profile)
**Then** `GET /auth/me` devuelve `role: 'both'`
**And** el usuario puede acceder a endpoints de driver (`/drivers/me/status`)
**And** el usuario puede acceder a endpoints de passenger (`/passenger/profile`)
