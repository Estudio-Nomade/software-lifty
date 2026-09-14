# Lifty — Backend (Bun + Elysia + Drizzle)

## Stack
- **Bun** runtime, **Elysia** HTTP framework, **Drizzle ORM** + **PostgreSQL** (Supabase)
- **Supabase** para DB hosting y Storage (documentos de conductores)
- **Resend** para emails transaccionales (verificacion de cuenta)
- Auth: Supabase Auth SDK (`supabase.auth.getUser()` para verificacion, sin JWT propio)
- Redis (ioredis) para rate limiting y cache de ubicacion

## Commands
```bash
bun run dev          # desarrollo con hot reload
bun test             # correr tests (194 tests, 17 suites)
```

## Auth
- Auth via Supabase Auth. El backend verifica tokens con `supabase.auth.getUser()`.
- `GET /auth/me` → datos del usuario autenticado (desde DB local)
- `POST /auth/logout` → cierre de sesion (no-op, Supabase maneja la sesion)
- El authPlugin auto-crea la fila en `users` cuando un `sub` nuevo toca el backend por primera vez.
- Variables requeridas: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY`

## Endpoints públicos

`GET /api/drivers/:id/profile` es el **único endpoint sin autenticación** de la API. Expone
el perfil público del conductor para que un pasajero pueda verlo.

- **Sin auth**: no requiere JWT.
- **Rate limit propio**: 10 req/min por IP (más estricto que el global de 100). Configurable
  con `PUBLIC_PROFILE_RATE_LIMIT_MAX` y `PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS`.
- **Datos expuestos**: `full_name` (solo primer nombre), `avatar_url`, `rating_avg`,
  `total_trips`, `kyc_verified`, y datos del vehículo (`brand`, `model`, `year`, `color`).
  No expone teléfono, email, patente ni identidad completa.

Cualquier endpoint público nuevo debe documentarse aquí y llevar su propio rate limit.

## Conexión a la DB (`DATABASE_URL`)

La app conecta a Postgres via `pg` Pool (`src/shared/db/client.ts`). **Usar siempre el connection pooler de Supabase**, no el host directo.

### Por qué no el host directo
El host directo `db.<ref>.supabase.co` es **IPv6-only** (salvo que se pague el IPv4 add-on). En redes sin IPv6 falla con `getaddrinfo ENOTFOUND` y toda query a la DB revienta (ej: `POST /auth/login` → "DB error looking up user"). El pooler `aws-<n>-<region>.pooler.supabase.com` resuelve a IPv4, así que anda en IPv4 y en dual-stack.

### Dos puertos, dos usos
El usuario del pooler es `postgres.<project-ref>` (no `postgres` a secas).

| Puerto | Modo | Usar para |
|--------|------|-----------|
| **6543** | Transaction pooler | **Runtime de la app** (`DATABASE_URL`). Sin prepared statements ni estado de sesión — compatible con Drizzle + `pg`. |
| **5432** | Session pooler | **Migraciones / Supabase CLI** y cualquier herramienta que necesite sesión (`supabase db push`, `LISTEN/NOTIFY`, etc.). |

```bash
# App (runtime) — puerto 6543
DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-<n>-<region>.pooler.supabase.com:6543/postgres

# Migraciones — misma cadena pero puerto 5432 (session mode)
```

La cadena exacta se copia del Dashboard → Settings → Database → Connection string (Transaction / Session pooler).

## Migraciones

### Setup inicial
El proyecto usa **Supabase CLI** para migraciones. Las migraciones de Drizzle (`src/shared/db/migrations/`) estan duplicadas en `supabase/migrations/` para compatibilidad con `supabase db push`.

```bash
# Una sola vez al clonar el repo
supabase link --project-ref wabddbkwugepkwrgzhpk
```

### Flujo diario
```bash
# Ver estado de migraciones
supabase migration list

# Aplicar migraciones pendientes al remote
supabase db push

# Si hay desincronizacion (migraciones aplicadas pero no trackeadas):
# 1. Identificar cuales faltan con `supabase migration list`
# 2. Reparar una por una:
supabase migration repair --status applied 20250101000013
# 3. Si la migracion no se aplico realmente (solo se reparo el historial),
#    ejecutar el SQL manualmente en Supabase SQL Editor
```

### Crear nueva migracion
```bash
supabase migration new nombre_descriptivo
# Editar supabase/migrations/<timestamp>_nombre_descriptivo.sql
supabase db push
```

### Nota importante
Si `supabase db push` falla porque la migracion ya existe en la DB pero no en el historial, usar `supabase migration repair --status applied <id>`. Esto solo actualiza la tabla de historial -- la migracion DEBE haberse ejecutado previamente o ejecutarse manualmente en SQL Editor.

### Schema Drizzle
Las definiciones de schema en `src/shared/db/schema/` son la fuente de verdad para Drizzle ORM. Las migraciones de Supabase deben mantenerse sincronizadas con estas definiciones.

## Transit bridge (stickers / identification)

Server-to-server only. web-tránsito confirms physical sticker delivery.

```
POST /api/internal/transit/identification/issue
Authorization: Bearer <TRANSIT_BRIDGE_SECRET>
# or X-Transit-Bridge-Secret: <TRANSIT_BRIDGE_SECRET>
```

Body: `{ "driver_id": "<uuid drivers.id>", "issued_at"?: ISO, "external_ref"?: string, "district_id"?: uuid }`

- Sets `drivers.identification_status = issued` (+ issued_at, optional external_ref).
- Does **not** auto-online. Does **not** change platform review status.
- Fail closed if `TRANSIT_BRIDGE_SECRET` unset (503 `BRIDGE_NOT_CONFIGURED`).
- Platform not approved → 409 `PLATFORM_NOT_APPROVED`.
- Idempotent if already `issued` → 200.

### Online gates (`PUT /api/drivers/me/online` when turning on)

1. `documents_pending_review` → 409 `DOCUMENTS_UNDER_REVIEW`
2. `status !== 'approved'` → 403 `DRIVER_NOT_APPROVED`
3. no `district_id` → 400 `DISTRICT_REQUIRED`
4. `identification_status !== 'issued'` → 409 `STICKERS_REQUIRED`

Env: `TRANSIT_BRIDGE_SECRET` (backend `.env` only — never mobile / `VITE_*`).

Contract: `specs/spec-admin-panel-stickers-gate/transit-bridge.md`
