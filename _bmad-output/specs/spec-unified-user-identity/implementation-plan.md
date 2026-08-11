# Implementation Plan — Unified User Identity

> **Target:** `_bmad-output/specs/spec-unified-user-identity/SPEC.md`
> **Branch:** `feat/passenger-auth-flow`
> **Estimated:** 3-5 days for full implementation

---

## Phase 1: Database & Backend Core (Day 1-2)

### Task 1.1: Create `passenger_profiles` table

**Files:**
- Create: `apps/backend/src/shared/db/schema/passenger-profiles.ts`
- Modify: `apps/backend/src/shared/db/schema/index.ts` (export new table)

**What:** Nueva tabla Drizzle con `id`, `user_id` (UNIQUE FK → users.id), `created_at`, `updated_at`. Sin columnas de preferencias todavía — eso es deferred.

```ts
// passenger-profiles.ts
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passengerProfiles = pgTable('passenger_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
```

**Verify:** `bun run db:push` (or Supabase migration) crea la tabla sin errores.

### Task 1.2: Add `deriveRole` to auth middleware

**Files:**
- Modify: `apps/backend/src/shared/middleware/auth.ts`

**What:** Nueva función `deriveRole(userId)` que consulta `drivers` y `passengerProfiles` y devuelve `'driver' | 'passenger' | 'both' | null`.

**Verify:** Test unitario con los 4 casos.

### Task 1.3: Update `findOrCreateUser` to not hardcode role

**Files:**
- Modify: `apps/backend/src/shared/middleware/auth.ts`

**What:** 
- Quitar `role: 'driver'` del INSERT en `findOrCreateUser`
- Llamar `deriveRole(userId)` al leer el usuario
- El `AuthUser` interface gana `role: string | null`

**Verify:** Test de integración: nuevo usuario → `role: null`. Usuario con driver profile → `role: 'driver'`.

### Task 1.4: Update `requireRole` for dual roles

**Files:**
- Modify: `apps/backend/src/shared/middleware/roles.ts`

**What:** `requireRole('driver')` también acepta `role: 'both'`. Misma lógica para `'passenger'`.

**Verify:** Test con usuario `role: 'both'` → aceptado por `requireRole('driver')` y `requireRole('passenger')`.

### Task 1.5: Add `GET /auth/me` role derivation

**Files:**
- Modify: `apps/backend/src/features/auth/service.ts`

**What:** `getMe()` usa `deriveRole` para poblar el campo `role` en la respuesta.

**Verify:** Test E2E: crear driver profile → `/auth/me` devuelve `role: 'driver'`. Crear passenger profile → `role: 'both'`.

---

## Phase 2: Passenger Registration Flow (Day 2-3)

### Task 2.1: Create `features/passengers` module

**Files:**
- Create: `apps/backend/src/features/passengers/service.ts`
- Create: `apps/backend/src/features/passengers/routes.ts`
- Create: `apps/backend/src/features/passengers/controller.ts`

**What:** `PassengersService.register(userId)` — crea un `passenger_profiles` row si no existe. `getProfile(userId)` — devuelve el perfil o null.

```ts
// service.ts
async register(userId: string) {
  const [existing] = await db.select().from(passengerProfiles)
    .where(eq(passengerProfiles.user_id, userId)).limit(1);
  if (existing) return existing;
  
  const [created] = await db.insert(passengerProfiles)
    .values({ user_id: userId })
    .returning();
  return created;
}
```

**Verify:** POST crea el row. POST duplicado devuelve el existente sin error.

### Task 2.2: Wire passenger registration in mobile app

**Files:**
- Modify: `apps/mobile-passengers/src/screens/LoginCredentialsScreen.tsx`

**What:** Después de `signUp` exitoso, llamar al backend `POST /passenger/register` para crear el perfil. Si el usuario ya existe (`User already registered`), hacer `signIn` y luego llamar igual a register.

**Verify:** Flujo E2E desde la app: Register → Terms → LoginCredentials → signUp → Home (con perfil creado).

---

## Phase 3: Verify & Polish (Day 3-4)

### Task 3.1: Regression test driver app

**What:** Correr todos los tests del backend (`bun test` en `apps/backend`). Verificar que ningún endpoint del driver se rompe con los cambios de `findOrCreateUser` y `requireRole`.

**Verify:** 206+ tests pasando.

### Task 3.2: Test dual-role scenario

**What:** Script de prueba: crear usuario vía driver → verificar `role: 'driver'` → crear passenger profile → verificar `role: 'both'` → ambos endpoints accesibles.

### Task 3.3: Handle existing user in passenger sign-up

**Files:**
- Modify: `apps/mobile-passengers/src/screens/LoginCredentialsScreen.tsx`

**What:** Si `signUp` devuelve error "User already registered", cambiar a modo `signIn` automáticamente y mostrar mensaje "Ya tenés cuenta, iniciando sesión...".

---

## Self-Review Checklist

| Check | Status |
|-------|--------|
| `findOrCreateUser` no hardcodea role | ⬜ |
| `deriveRole` cubre los 4 casos | ⬜ |
| `requireRole` acepta both | ⬜ |
| Driver tests pasan sin cambios | ⬜ |
| Passenger registration crea perfil | ⬜ |
| Usuario existente puede registrarse como passenger | ⬜ |
| `GET /auth/me` devuelve role derivado | ⬜ |
| `trips.passenger_id` sigue funcionando | ⬜ |
