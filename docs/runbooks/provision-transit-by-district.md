# Runbook — Provision tránsito por municipio (wabdd)

**Project:** `https://wabddbkwugepkwrgzhpk.supabase.co`  
**Nunca** commitear passwords, service_role ni `TRANSIT_BRIDGE_SECRET`.  
**Nunca** pegar passwords en PRs / chat.

## Objetivo

Un user Auth `role=transit` por municipio, con `users.transit_district_id` apuntando al `districts.id` correspondiente. El panel web-transito elige municipio → login email/pass de ese municipio → API scopa drivers por `district_id`.

## Vía canónica (ops)

1. Abrí **lifty-admin** → **Operadores tránsito** (`/transit-operators`).
2. **Nuevo operador** → elegí municipio → email sugerido `{slug}@liftyviajes.com` (editable) → password (generar o manual).
3. Tras crear: modal con email + pass **una sola vez** → copiá y enviá por canal seguro.
4. Acciones fila: **Reset pass**, **Cambiar municipio**.

Backend: `POST/GET/PATCH /api/admin/transit-operators*` (solo `role=admin`). Auth Admin + upsert `users` (`role=transit`, `transit_district_id`). Un municipio = un operador activo (409 si ya existe).

## Prerequisites

1. Migración `users.transit_district_id` aplicada (Drizzle `0043` / Supabase `20260917010000_user_transit_district`).
2. Tabla `districts` con municipios activos (seed Córdoba).
3. Backend con `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`) server-side, misma DB que provisionás (local `:5433` o pooler wabdd).
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

```sql
insert into public.users (id, email, role, full_name, transit_district_id)
values (
  :uid,
  :email,
  'transit',
  :full_name,  -- ej. 'Tránsito Villa Dolores'
  :district_id
)
on conflict (id) do update
set email = excluded.email,
    role = 'transit',
    full_name = coalesce(excluded.full_name, public.users.full_name),
    transit_district_id = excluded.transit_district_id;

delete from public.drivers where user_id = :uid;
delete from public.passenger_profiles where user_id = :uid;
```

```bash
cd apps/backend
# SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL
# No imprime passwords a stdout
bun run scripts/provision-transit-districts.ts
```

## Verify

- `GET /api/auth/me` → `role: transit`, `transit_district_id`, `district_name`
- `GET /api/transit/drivers` → solo drivers de ese distrito
- `GET /api/admin/drivers/pending` con token transit → **403**
- Segundo operador mismo `district_id` → **409**

## Deprecar transit global

`transito@liftyviajes.com` sin `transit_district_id` queda **bloqueado** (403 en list/stats). No crear transit “global” sin municipio. Soporte multi-municipio = cuenta `admin` + selector de municipio en UI (admin puede `?district_id=` o ver todos).

## UI smoke

1. web-transito → selector municipio  
2. Villa Dolores → email pre-relleno `villadolores@…` → login  
3. Sidebar muestra **Villa Dolores**  
4. Otro municipio / otra cuenta → no ve drivers del primero  
5. Logout → vuelve a selector  

## Decisión admin

**Default:** admin Lifty elige municipio en el selector igual que tránsito (scope UX). API: admin sin `?district_id=` ve todos; con query filtra. Toggle “Todos” solo admin puede añadirse después.
