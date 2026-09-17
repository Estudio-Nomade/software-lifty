# Runbook — Provision tránsito por municipio (wabdd)

**Project:** `https://wabddbkwugepkwrgzhpk.supabase.co`  
**Nunca** commitear passwords, service_role ni `TRANSIT_BRIDGE_SECRET`.  
**Nunca** pegar passwords en PRs / chat.

## Objetivo

Un user Auth `role=transit` por municipio, con `users.transit_district_id` apuntando al `districts.id` correspondiente. El panel web-transito elige municipio → login email/pass de ese municipio → API scopa drivers por `district_id`.

## Prerequisites

1. Migración `users.transit_district_id` aplicada (Drizzle `0043` / Supabase `20260917010000_user_transit_district`).
2. Tabla `districts` con municipios activos (seed Córdoba).
3. Backend apunta a la misma DB que provisionás (local `:5433` o pooler wabdd).
4. service_role wabdd solo en shell local / password manager.

## Email / password pattern (ops)

| Municipio (name exacto) | Email sugerido | Password inicial (ops-only) |
|-------------------------|----------------|-----------------------------|
| Villa Dolores | `villadolores@liftyviajes.com` | `Villadolorestransito` |
| Villa de las Rosas | `villadelasrosas@liftyviajes.com` | `Villadelasrosastransito` |
| Villa Sarmiento | `villasarmiento@liftyviajes.com` | `Villasarmientotransito` |
| Mina Clavero | `minaclavero@liftyviajes.com` | `Minaclaverotransito` |
| San Javier | `sanjavier@liftyviajes.com` | `Sanjaviertransito` |
| Nono | `nono@liftyviajes.com` | `Nonotransito` |
| Las Calles | `lascalles@liftyviajes.com` | `Lascallestransito` |

**Guardar passwords reales** en:

```text
~/Documentos/LIfty/.ops-local/transit-municipio-passwords.txt
chmod 600 ~/Documentos/LIfty/.ops-local/transit-municipio-passwords.txt
```

Ese path **no** va a git (`.ops-local` fuera de repos o en gitignore).

## Pasos por municipio

1. **Auth Admin** (service_role wabdd): create user  
   - email = patrón de la tabla  
   - `email_confirm: true`  
   - password = ops-only  
2. Anotar Auth `user.id` (UUID).  
3. Resolver `districts.id` por `name` exacto.  
4. **Upsert** `public.users`:

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

5. Opcional: Auth `app_metadata.role = 'transit'`.  
6. **Verify:**  
   - `GET /api/auth/me` → `role: transit`, `transit_district_id`, `district_name`  
   - `GET /api/transit/drivers` → solo drivers de ese distrito  
   - `GET /api/admin/drivers/pending` → **403**

## Deprecar transit global

`transito@liftyviajes.com` sin `transit_district_id` queda **bloqueado** (403 en list/stats). Deprecar en docs; no crear transit “global” sin municipio. Soporte multi-municipio = cuenta `admin` + selector de municipio en UI (admin puede `?district_id=` o ver todos).

## Script opcional

```bash
cd apps/backend
# Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL
# No imprime passwords a stdout
bun run scripts/provision-transit-districts.ts
```

## UI smoke

1. web-transito → selector municipio  
2. Villa Dolores → email pre-relleno `villadolores@…` → login  
3. Sidebar muestra **Villa Dolores**  
4. Otro municipio / otra cuenta → no ve drivers del primero  
5. Logout → vuelve a selector  

## Decisión admin

**Default:** admin Lifty elige municipio en el selector igual que tránsito (scope UX). API: admin sin `?district_id=` ve todos; con query filtra. Toggle “Todos” solo admin puede añadirse después.
