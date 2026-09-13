# Architecture — Admin panel + stickers hard gate

Companion de `SPEC-admin-panel-stickers-gate`.

## Context diagram

```mermaid
flowchart LR
  subgraph liftyMono["Monorepo software-lifty"]
    mobileDrv["apps/mobile conductor"]
    mobilePax["apps/mobile-passengers"]
    adminWeb["apps/admin ops"]
    api["apps/backend Elysia"]
    sbLifty[("Supabase Lifty DB + Auth")]
  end

  subgraph afuera["Fuera del monorepo"]
    transitWeb["Web tránsito"]
    sbTransit[("Supabase tránsito")]
  end

  mobileDrv -->|JWT Bearer| api
  mobilePax -->|JWT Bearer| api
  adminWeb -->|JWT admin| api
  api --> sbLifty
  transitWeb --> sbTransit
  transitWeb -->|"POST bridge secret issue stickers"| api
```

## Two axes of driver readiness

```mermaid
stateDiagram-v2
  [*] --> Onboarding
  Onboarding --> Review: docs submitted
  Review --> Rejected: admin reject
  Review --> PlatformApproved: admin approve
  note right of PlatformApproved
    admin_review_status = approved
    identification_status = pending_pickup
    is_online must stay false
  end note
  PlatformApproved --> ReadyToDrive: transit bridge issue
  note right of ReadyToDrive
    identification_status = issued
    toggleOnline allowed if other gates pass
  end note
  ReadyToDrive --> RevokedId: future revoke
  RevokedId --> PlatformApproved: pending_pickup again
```

**Axis A — Platform review** (Lifty admin): `drivers.status` / `admin_review_status`, documents, KYC.  
**Axis B — Physical identification** (tránsito via bridge): `identification_status`.

Conducir requiere **ambos** + `district_id` + no `documents_pending_review` (gates ya existentes).

## Data model (Lifty)

### `drivers` — columnas nuevas

| Column | Type | Notes |
|--------|------|--------|
| `identification_status` | varchar(30) not null | default al crear fila: `pending_pickup` **o** solo setear en primer approve; ver migración |
| `identification_issued_at` | timestamptz null | set en issue |
| `identification_external_ref` | varchar/text null | opcional id de entrega en web-tránsito |

**Valores `identification_status`:**

| Value | Meaning |
|-------|---------|
| `pending_pickup` | Falta retirar stickers en tránsito |
| `issued` | Entrega confirmada por bridge |
| `revoked` | Reservado; si se usa → forzar offline y bloquear online |

### Migración / backfill

Recomendación de esta architecture:

1. Add columns.
2. Backfill: todos los drivers existentes con `identification_status = 'pending_pickup'`.
3. Si ops necesita grandfather de cuentas de prueba ya “reales”, script one-off o SQL manual → `issued` (no default automático a issued).

Al **approve** plataforma: si status identification es null/legacy → `pending_pickup`; si ya `issued` no pisar a pending (re-approve edge).

### Qué no se modela acá

- Sede, horarios, stock de calcomanías, operador municipal → web-tránsito / su DB.
- Tabla `sticker_events` full audit: opcional Phase 3; MVP con columnas en `drivers` + logs backend alcanza.

## Backend touchpoints

| Concern | Where today | Change |
|---------|-------------|--------|
| Approve API | `features/admin/service.ts` `reviewDriver` | set identification pending; copy |
| Approve one-click | `features/admin/approve.ts` | idem |
| Notify copy | `features/admin/notifications.ts` | no “ya conducir” |
| Online gate | `features/drivers/service.ts` `toggleOnline` | `STICKERS_REQUIRED` |
| Status payload | `getStatus` / profile | expose `identification_status` |
| Bridge | **new** `features/admin` o `features/transit-bridge` | issue endpoint |
| Admin list/detail | `adminService` | return identification fields |

### `toggleOnline` gate order (conceptual)

```
if turning on:
  deny if documents_pending_review     → DOCUMENTS_UNDER_REVIEW
  deny if status !== 'approved'        → DRIVER_NOT_APPROVED
  deny if !district_id                 → DISTRICT_REQUIRED
  deny if identification_status !== 'issued' → STICKERS_REQUIRED
  else set is_online true
```

Matching ya filtra `is_online=true`; no confiar solo en eso para writes: el gate está en toggle.

## `apps/admin` (Phase 2)

```
apps/admin/
  package.json          @lifty/admin
  vite.config.ts
  index.html
  src/main.tsx
  src/App.tsx           router
  src/lib/supabase.ts
  src/lib/api.ts        fetch + Bearer
  src/pages/Login.tsx
  src/pages/PendingQueue.tsx
  src/pages/DriverDetail.tsx
```

- Auth: same Supabase **Lifty** project as mobile (publishable key + session).
- API base: `VITE_API_URL` → backend.
- After login, call something cheap (`/auth/me` o pending list); if role ≠ admin, sign out + error.
- No shared UI kit mandatory with Expo; keep simple.

Root `package.json`:

```json
"dev:admin": "bun run --filter @lifty/admin dev"
```

**Do not** wire into `scripts/dev-all.ts` in MVP (QR mobile stability).

## Mobile conductor (Phase 1 mínimo)

- Types: `identification_status` on driver status schema.
- Online toggle / connect path: disable + message when not `issued`.
- Optional: route step `pending_stickers` later; MVP puede quedarse en `Active` con banner (como docs under review).
- Push types: keep `kyc:approved` for platform approve but body text = ir a tránsito; new type opcional `identification:issued` on bridge.

## Security

| Surface | Auth |
|---------|------|
| Admin UI + `/admin/*` | Supabase JWT + `users.role=admin` |
| Bridge issue | Shared secret header only (server-server) |
| Driver app | Supabase JWT driver; **cannot** call bridge |
| One-click email approve | existing token; only platform axis |

Rate-limit bridge by IP + secret failure logging.

## Env vars (nombres propuestos)

| Var | Side | Purpose |
|-----|------|---------|
| `TRANSIT_BRIDGE_SECRET` | backend Lifty | validate bridge |
| same secret | web-tránsito server | send bridge calls |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | apps/admin | Lifty auth |
| `VITE_API_URL` | apps/admin | backend |

## Out of scope architecture

- Unificar proyectos Supabase.
- RLS cross-project.
- Event bus / queue (overkill MVP; HTTP sync issue is enough).
