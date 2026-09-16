# Checklist ops — cutover wabdd (humano + agente)

**Canonical Auth/DB project:** `https://wabddbkwugepkwrgzhpk.supabase.co`  
**Passwords staff locales (NO git):** `/home/marti/Documentos/LIfty/.ops-local/staff-passwords-wabdd.txt`  
**Provision detail:** `docs/runbooks/provision-staff-wabdd.md`

## Ya hecho (agente, 2026-09-16)

- [x] Código 3 PRs: monorepo #329 · lifty-admin #1 · web-transito #4
- [x] Local admin/tránsito `.env` → wabdd publishable
- [x] Auth wabdd: `admin@liftyviajes.com` existe; `transito@liftyviajes.com` creado + password grant OK
- [x] Postgres **local** `:5433`: rows `users.role=admin|transit` alineadas a Auth UUIDs wabdd; sin perfiles driver/pax
- [x] `CORS_ORIGIN` local backend incluye Vite 5173/5174 + `lifty-admin-beta` + `web-transito.vercel.app`
- [x] `TRANSIT_BRIDGE_SECRET` generado en backend `.env` local
- [x] Vercel env `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` → wabdd (prod/preview/dev) admin + tránsito
- [x] Redeploy prod: `https://lifty-admin-beta.vercel.app` + `https://web-transito.vercel.app`

## Pendiente humano (orden)

### A. Password admin (si no la tenés)

Si no recordás la de `admin@liftyviajes.com` en wabdd:

1. Supabase Dashboard → proyecto **wabdd** → Authentication → Users → admin@… → Reset password  
   **o** pedile al agente que resetee con service_role y deje la pass en `.ops-local/` (no chat).

### B. Staff en Postgres **cloud** wabdd (si la API de verdad lee cloud)

Hoy el backend local usa `DATABASE_URL=…localhost:5433`. Las filas admin/transit se upsertaron **ahí**.

Si más adelante el backend (Lightsail/prod) usa pooler wabdd, corré en **SQL Editor wabdd** (uids reales del run local):

```sql
-- Reemplazar UUIDs si cambian (ver Authentication → Users)
insert into public.users (id, email, role, full_name)
values
  ('aa3fdabf-e1e1-40e5-817e-b68a1272c023', 'admin@liftyviajes.com', 'admin', 'Lifty Admin'),
  ('0e9827a7-b505-49ee-8d3c-23844ac7633a', 'transito@liftyviajes.com', 'transit', 'Operador Tránsito')
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    full_name = coalesce(public.users.full_name, excluded.full_name);

delete from public.drivers where user_id in (
  'aa3fdabf-e1e1-40e5-817e-b68a1272c023',
  '0e9827a7-b505-49ee-8d3c-23844ac7633a'
);
delete from public.passenger_profiles where user_id in (
  'aa3fdabf-e1e1-40e5-817e-b68a1272c023',
  '0e9827a7-b505-49ee-8d3c-23844ac7633a'
);
```

### C. API pública para Vercel (bloqueante prod)

`software-lifty-backend.vercel.app` responde **500**. Los paneles en Vercel **no** pueden usar `127.0.0.1:3001`.

Opciones:

1. **Dev local (recomendado hoy):** `bun run dev` en backend + paneles `bun run dev` con `VITE_API_URL` local (ya está).
2. **Prod:** deploy API (Lightsail `deploy/lightsail/` u otro host) y setear en Vercel:
   - admin: `VITE_API_URL=https://<api-publica>` (sin o con `/api` — admin agrega `/api` si falta)
   - tránsito: `VITE_API_URL=https://<api-publica>/api`
   - backend prod: `CORS_ORIGIN` con ambos Vercel + `DATABASE_URL` pooler wabdd + mismas keys Supabase wabdd + `TRANSIT_BRIDGE_SECRET`

### D. Smoke local E2E

```bash
export PATH="$HOME/.bun/bin:$PATH"
# terminal 1
cd ~/Documentos/LIfty/software-lifty/apps/backend && bun run dev
# terminal 2
cd ~/Documentos/LIfty/apps/admin && bun run dev   # :5174
# terminal 3
cd ~/Documentos/LIfty/web-transito && bun run dev # :5173
```

1. Admin http://localhost:5174 → login `admin@liftyviajes.com` → cola/conductores (DB local tiene drivers).
2. Tránsito http://localhost:5173 → login `transito@liftyviajes.com` + pass en `.ops-local/…` → lista real (no Juan Pérez seed).
3. Approve un pending (si hay) → tránsito ve `pending_pickup` → Marcar entregado → `issued`.

### E. Merge PRs

- https://github.com/Estudio-Nomade/software-lifty/pull/329  
- https://github.com/Estudio-Nomade/lifty-admin/pull/1  
- https://github.com/Estudio-Nomade/web-transito/pull/4  

### F. Freeze legacy

Tras smoke 7–14d: deshabilitar signup en `dlqvos` / `ykchnss`, rotar keys, no borrar ya.

## Cuentas

| Email | Rol | Password |
|-------|-----|----------|
| `admin@liftyviajes.com` | admin | la que ya usabas en wabdd / reset |
| `transito@liftyviajes.com` | transit | archivo `.ops-local/staff-passwords-wabdd.txt` |
