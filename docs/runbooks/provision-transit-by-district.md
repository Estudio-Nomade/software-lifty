# Runbook — Provision tránsito por municipio (wabdd)

**Project:** `https://wabddbkwugepkwrgzhpk.supabase.co`  
**Nunca** commitear passwords, service_role ni `TRANSIT_BRIDGE_SECRET`.  
**Nunca** pegar passwords en PRs / chat.

## Vía canónica (ops)

1. Abrí **lifty-admin** → **Operadores tránsito** (`/transit-operators`).
2. **Nuevo operador** → elegí municipio → email sugerido `{slug}@liftyviajes.com` (editable) → password (generar o manual).
3. Tras crear: modal con email + pass **una sola vez** → copiá y enviá por canal seguro.
4. Acciones fila: **Reset pass**, **Cambiar municipio**.

Backend: `POST/GET/PATCH /api/admin/transit-operators*` (solo `role=admin`). Auth Admin + upsert `users` (`role=transit`, `transit_district_id`). Un municipio = un operador activo (409 si ya existe).

## Prerequisites

1. Migración `users.transit_district_id` aplicada (Drizzle `0043` / Supabase `20260917010000_user_transit_district`).
2. Tabla `districts` con municipios activos (seed Córdoba).
3. Backend con `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`) server-side.
4. Admin logueado con `users.role = admin`.

## Email sugerido (slug)

| Municipio | Email |
|-----------|-------|
| Villa Dolores | `villadolores@liftyviajes.com` |
| Villa de las Rosas | `villadelasrosas@liftyviajes.com` |
| Villa Sarmiento | `villasarmiento@liftyviajes.com` |
| Mina Clavero | `minaclavero@liftyviajes.com` |
| San Javier | `sanjavier@liftyviajes.com` |
| Nono | `nono@liftyviajes.com` |
| Las Calles | `lascalles@liftyviajes.com` |

Passwords: solo en el modal del admin o en `~/Documentos/LIfty/.ops-local/` (chmod 600). **No** git.

## Fallback SQL / CLI (bootstrap o disaster recovery)

Solo si el panel no está disponible:

1. Auth Admin create user (`email_confirm: true`).
2. Upsert `public.users` con `role=transit` + `transit_district_id`.
3. `delete from drivers/passenger_profiles where user_id = :uid`.

```bash
cd apps/backend
# SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL
bun run scripts/provision-transit-districts.ts
```

## Verify

- `GET /api/auth/me` → `role: transit`, `transit_district_id`, `district_name`
- `GET /api/transit/drivers` → solo drivers de ese distrito
- `GET /api/admin/drivers/pending` con token transit → **403**
- Segundo operador mismo `district_id` → **409**

## Deprecar transit global

`transito@liftyviajes.com` sin `transit_district_id` queda **bloqueado** (403 en list/stats). No crear transit “global” sin municipio.
