# Affected files — SPEC-admin-panel-stickers-gate

Estimación para implementación. Ajustar si el árbol se mueve.

## Phase 1 — Gate + bridge (backend)

### Create
- `apps/backend/supabase/migrations/<ts>_driver_identification_status.sql`
- `apps/backend/src/shared/db/migrations/<ts>_driver_identification_status.sql` (si el repo duplica drizzle/sql)
- `apps/backend/src/features/transit-bridge/` **o** bajo `features/admin/`:
  - `routes.ts` (issue)
  - `service.ts`
  - `schema.ts` (body validation)
  - `transit-bridge.test.ts`

### Modify
- `apps/backend/src/shared/db/schema/drivers.ts` — columnas identification_*
- `apps/backend/src/shared/db/schema/index.ts` — si re-exporta
- `apps/backend/src/features/admin/service.ts` — approve → pending_pickup; detail/list fields; `listDrivers` registry
- `apps/backend/src/features/admin/routes.ts` — `GET /admin/drivers`
- `apps/backend/src/shared/db/schema/users.ts` + migration — `document_number` (DNI)
- `apps/backend/src/features/admin/approve.ts` — same semantics + copy push
- `apps/backend/src/features/admin/notifications.ts` — copy mail approve
- `apps/backend/src/features/admin/admin.test.ts` — assertions identification + online
- `apps/backend/src/features/drivers/service.ts` — `toggleOnline`, `getStatus` (y profile si aplica)
- `apps/backend/src/features/drivers/drivers.test.ts` — online gates + stickers deadline
- `apps/backend/src/shared/lib/identification-deadline.ts` (+ test) — 20d reminder / 30d suspensión
- `apps/backend/src/index.ts` (o router root) — mount bridge routes
- `apps/backend/AGENTS.md` — documentar bridge + env `TRANSIT_BRIDGE_SECRET`
- env examples / setup scripts si existen (`.env.example`) — **sin** secret real

## Phase 1 — Mobile conductor (mínimo)

### Modify
- `apps/mobile/src/api/types.ts` (o zod schemas) — `identification_status`
- `apps/mobile/src/lib/postAuthRouting.ts` — solo si se agrega step dedicado; si no, skip
- Pantalla/home donde está el toggle online (p.ej. Active / Online related) — banner + disable
- `apps/mobile/src/lib/notifications.ts` / handlers — copy o tipo `identification:issued` si se agrega
- Tests mobile si hay coverage del toggle/status

## Phase 2 — admin ops (fuera monorepo)

### Create (path absoluto)
- `/home/marti/Documentos/LIfty/apps/admin/**` (Vite + shadcn; no workspace monorepo)

### Modify monorepo
- Root `AGENTS.md` — documentar path externo `LIfty/apps/admin`
- **No** `dev:admin` en monorepo root; **no** turbo package

## Explicitly not touched (this SPEC)

- `apps/mobile-passengers/**` (salvo que status compartido diga lo contrario — no)
- Web-tránsito repo (solo consume el contrato; cambios allá, no acá)
- Unificación de proyectos Supabase
- `scripts/dev-all.ts` (no meter admin en MVP)

## Docs already aligned

- `docs/brainstorms/2026-04-02-admin-panel-y-transito-logos.md` — decisions locked
- `.hermes/plans/2026-09-11_124605-admin-panel-decisions-locked.md`
