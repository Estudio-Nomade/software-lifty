# @lifty/admin

Panel ops Lifty (review de conductores). Vite + React + shadcn + Tailwind v4.

## Dev

```bash
# desde monorepo root
bun install
bun run dev:admin
# → http://127.0.0.1:5174
```

**No** está en `bun run dev` / `dev-all` (estabilidad QR Expo).

## Env

Copiá `.env.example` → `.env`:

| Var | Valor |
|-----|--------|
| `VITE_SUPABASE_URL` | Proyecto **Lifty** `wabddbkwugepkwrgzhpk` |
| `VITE_SUPABASE_ANON_KEY` | anon/publishable Lifty |
| `VITE_API_URL` | `http://127.0.0.1:3001` (backend monorepo) |

**No** uses keys de web-tránsito (`ykchnss…`).

## Auth

Login email+password Supabase. Tras login se exige `users.role === 'admin'` vía `GET /api/auth/me` (fallback: pending list).

## Scope MVP

- Cola pendientes + ficha + approve/reject
- Badge identificación (solo lectura; stickers los marca tránsito vía bridge)
