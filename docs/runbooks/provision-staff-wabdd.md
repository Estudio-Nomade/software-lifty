# Runbook — Provision staff (admin / transit) on canonical Supabase `wabdd`

**Project:** `https://wabddbkwugepkwrgzhpk.supabase.co`  
**Ref:** `wabddbkwugepkwrgzhpk`  
**Never** use service_role / keys from legacy `dlqvos…` or `ykchnss…`.  
**Never** commit passwords, service_role, or `TRANSIT_BRIDGE_SECRET`.

## Why

Panels (lifty-admin, web-transito) and backend must share **one** Auth issuer. Staff UUIDs from old projects are invalid against wabdd JWT validation.

## Prerequisites

- Supabase Dashboard → wabdd → **service_role** (or secret key) only in local shell / password manager
- Backend `SUPABASE_URL` = wabdd
- Backend `DATABASE_URL` = Postgres that backend actually serves (cloud pooler wabdd **or** local mirror with same schema)
- `ADMIN_EMAIL` env on backend includes admin ops mails (transit default: **do not** add)

## Admin account

1. **Auth Admin API** (service_role wabdd): create user  
   - email e.g. `admin@liftyviajes.com`  
   - `email_confirm: true`  
   - password: ops-only (do not write here)
2. Note Auth `user.id` (UUID).
3. **Upsert** `public.users`:
   - `id` = Auth UUID  
   - `role` = `'admin'`  
   - `email` = same  
   - `full_name` optional
4. **DELETE** any rows in `drivers` / `passenger_profiles` for that `id` (profiles win over `users.role` in `deriveRole`).
5. Optional: set Auth `app_metadata.role = 'admin'`.
6. Append email to backend `ADMIN_EMAIL` (comma-separated).
7. **Verify:** password grant against wabdd anon/publishable → Bearer  
   - `GET /api/auth/me` → `role: admin`  
   - `GET /api/admin/drivers/pending` → not 403

## Transit account (separate human / email)

Same as admin with:

- `role` = `'transit'`
- **Do not** add to `ADMIN_EMAIL` unless product asks for new-driver mails
- Optional `app_metadata.role = 'transit'`
- **Verify:**  
  - `GET /api/transit/stats` → 200  
  - `GET /api/admin/drivers/pending` → **403**

## SQL sketch (run in wabdd SQL editor after Auth create)

```sql
-- Replace :uid / :email / :role after Auth Admin create
insert into public.users (id, email, role, full_name)
values (:uid, :email, :role, :full_name)
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    full_name = coalesce(excluded.full_name, public.users.full_name);

delete from public.drivers where user_id = :uid;
delete from public.passenger_profiles where user_id = :uid;
```

## Curl smoke (local or public API)

```bash
# After login, ACCESS_TOKEN from session (not committed)
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$API/api/auth/me"
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$API/api/transit/stats"
# admin only:
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$API/api/admin/drivers/pending"
```

## Cutover notes for humans

- Old logins on `dlqvos` / `ykchnss` die after panel env points to wabdd (rebuild Vercel).
- Same password may be reused on the **new** wabdd user; UUID is new.
- Freeze legacy projects after stable smoke 7–14d; rotate their keys; do not delete projects in the same PR as cutover.

## Bridge secret (unchanged)

`POST /api/internal/transit/identification/issue` still uses `TRANSIT_BRIDGE_SECRET` server-to-server.  
Browser path = JWT `role=transit|admin` → `POST /api/transit/drivers/:id/identification/issue`.  
**Never** put bridge secret in `VITE_*`.
