# PROMPT · feat: panel admin shadcn + hard gate stickers + bridge tránsito

## Modo
**IMPLEMENTAR** end-to-end el flujo de producto (backend + `apps/admin` shadcn + mobile mínimo).  
No reabrir decisiones locked. No greenfield de web-tránsito (solo consumir contrato / checklist).  
Idioma de commits/PR body: español o inglés OK; conventional commits. Comentarios de UI en español (voseo AR).

## Repo
- Path monorepo: `/home/marti/Documentos/LIfty/software-lifty`
- Backend: `apps/backend` (`@lifty/backend`, Bun + Elysia + Drizzle + Supabase)
- Conductor: `apps/mobile` (`@lifty/mobile`, Expo SDK 54)
- **Nueva app:** `apps/admin` (última app del monorepo)
- Satellite (NO monorepo workspace): `/home/marti/Documentos/LIfty/web-transito` — solo lectura + checklist de integración al final; **no** meter UI de tránsito en este monorepo

## Base / branch
- Partí de `main` actualizado (`git fetch && git checkout main && git pull --ff-only`).
- Branch: `feat/admin-panel-shadcn-stickers-gate`
- `main` está **protegida** → branch + PR. Nunca push directo a main.
- Conventional commits. Preferí **varios commits lógicos** (migración → gate backend → bridge → copy/mobile → apps/admin) o un PR bien seccionado; no un mega-diff sin estructura.
- **No** `git add -A`. No meter: `.hermes/`, todos locales, `.env*`, secretos, WIP ajeno.
- Si el working tree tiene untracked de specs/brainstorms/handoffs: podés **incluir** en el PR:
  - `specs/spec-admin-panel-stickers-gate/**` (canónico)
  - este handoff `docs/handoffs/PROMPT-feat-admin-panel-shadcn-stickers-gate.md`
  - `docs/brainstorms/2026-04-02-admin-panel-y-transito-logos.md` si aún no está tracked
  - **No** commitear `.hermes/` salvo que el humano lo pida.

## Spec canónica (LEER ANTES DE CODEAR)
Leé **completo** y tratá como contrato:

1. `specs/spec-admin-panel-stickers-gate/SPEC.md`
2. `specs/spec-admin-panel-stickers-gate/architecture.md`
3. `specs/spec-admin-panel-stickers-gate/transit-bridge.md`
4. `specs/spec-admin-panel-stickers-gate/affected-files.md`
5. Pitfalls: skill/contexto Lifty `admin-and-transit-identification` (si no tenés skill: el brainstorm + SPEC bastan)
6. Backend: `apps/backend/AGENTS.md` (auth Supabase, migraciones dual path, pooler)
7. Root: `AGENTS.md` (no prod CD; ports; no meter admin en `dev-all`)

Si algo del código diverge del SPEC, **gana el SPEC** salvo bug de factibilidad — documentá la desviación en el PR.

---

## Síntoma / producto (palabras del humano — flujo objetivo)

1. El conductor se **registra** y sube documentos.
2. Esos docs van al **panel admin**; el admin se **entera** (mail ya existe; el panel es la UI diaria).
3. **Lifty aprueba** los docs en el panel.
4. El conductor queda **aprobado de plataforma**: puede **entrar y ver la app**, pero se le **recuerda que tiene que ir a tránsito** si todavía no fue.
5. Cuando va a tránsito, **tránsito confirma** la entrega de stickers/identificación y **avisa a Lifty**.
6. Lifty **habilita automáticamente** el gate de stickers → el conductor ya puede **conectarse / usar Lifty** (online), sin que ops Lifty marque a mano la entrega.

**Hard rule:** sin stickers emitidos por tránsito → **no** `is_online` / no conducir. Gate en **backend**, no solo UI.

---

## Decisiones LOCKED (no reabrir)

| # | Decisión | Valor |
|---|----------|--------|
| D1 | Panel ops Lifty | `apps/admin` en este monorepo |
| D2 | UI tránsito en monorepo | **No** — vive en `web-transito` |
| D3 | Stickers vs online | **Hard gate** |
| D4 | Quién marca entrega | **web-tránsito** (fuente de verdad física) |
| D5 | Cómo se enteran 2 Supabase | **HTTP bridge** secret server-to-server (no DB compartida) |
| D6 | Modelo | **Dos ejes**: (A) review docs/KYC plataforma · (B) `identification_status` stickers |
| D7 | UI admin | **shadcn/ui** + Vite + React + TS + Tailwind (bonito y completo para el MVP ops) |
| D8 | Admin “force issue” stickers | **Fuera de MVP** (solo badge lectura) |
| D9 | Self-report conductor “ya retiré” | **No** como camino feliz |

### Supabase split (no confudir)

| Consumer | Project ref |
|----------|-------------|
| Monorepo Lifty (mobile + backend + **apps/admin**) | `wabddbkwugepkwrgzhpk` |
| web-transito | `ykchnssqgzhkrniybhwk` |

`apps/admin` usa **Lifty** Supabase (mismo que mobile). Nunca keys de tránsito en admin ni viceversa.

---

## Estado actual del código (lag vs producto)

- **No existe** `apps/admin`.
- Ops hoy = mail + REST en `apps/backend/src/features/admin/`:
  - `GET /api/admin/drivers/pending`
  - `GET /api/admin/drivers/:id`
  - `POST /api/admin/drivers/:id/review` `{ action, notes }`
  - `GET /api/admin/approve?token=` one-click HTML (público)
  - commission / cancellations / fuel-price (Phase 3 thin UI opcional; **no** bloquea MVP)
- Al completar docs: `notifyAdminNewDriver` (Resend) — path B, no Auth OTP.
- Al approve: copy **incorrecta bajo hard gate** — “ya podés conducir / usar Lifty” en:
  - `apps/backend/src/features/admin/notifications.ts` → `notifyDriverApproved`
  - `apps/backend/src/features/admin/approve.ts` push `kyc:approved`
  - mobile UnderReview / postAuth → Active/Online sin paso tránsito
- `toggleOnline` hoy (`apps/backend/src/features/drivers/service.ts`):
  1. `documents_pending_review` → `DOCUMENTS_UNDER_REVIEW`
  2. `status !== 'approved'` → `DRIVER_NOT_APPROVED`
  3. sin `district_id` → `DISTRICT_REQUIRED`
  4. **Falta** `identification_status === 'issued'` → `STICKERS_REQUIRED`
- Schema `drivers` (`apps/backend/src/shared/db/schema/drivers.ts`): `status`, `admin_review_status`, `is_online`, `district_id` — **sin** `identification_*`.
- web-transito ya tiene páginas `PendingPickupPage`, `DriversPage`, `DriverDetailPage` (mocks) — listo para **llamar** al bridge cuando implementen su lado; este PR monorepo expone el endpoint y documenta el contrato.

---

## Flujo end-to-end (implementar esto)

```
Conductor onboarding → docs completos
        → drivers.status = review
        → mail admin (ya existe) + aparece en cola apps/admin
        ↓
Ops Lifty en apps/admin: abre ficha, ve docs, Approve
        → admin_review_status / status = approved (eje A)
        → identification_status = pending_pickup (eje B)   ← NO is_online
        → mail/push conductor: “docs OK → retirá stickers en tránsito”
        → app: puede navegar home/mapa según routing, PERO toggle online bloqueado + banner
        ↓
Conductor va a ventanilla municipal
Operador web-transito marca entregado
        → POST Lifty /api/internal/transit/identification/issue + TRANSIT_BRIDGE_SECRET
        → identification_status = issued + issued_at
        → push best-effort “ya podés conectarte”
        ↓
Conductor toggle online
        → gates: docs OK + approved + district + issued → is_online true
```

**Importante producto (humano):** “puede entrar y ver la app” = **no** dejarlo trabado eterno en UnderReview si ya está approved de plataforma. Sí recordatorio fuerte de tránsito + **bloqueo real de conectar/conducir** hasta `issued`.

---

## Qué construir (orden obligatorio)

### Phase 1 — Backend hard gate + bridge (núcleo; sin esto el panel miente)

#### 1.1 Migración
- Crear migración Supabase **y** espejo drizzle path si el repo lo duplica (ver `apps/backend/AGENTS.md`):
  - `drivers.identification_status` `varchar(30) not null` — valores: `pending_pickup | issued | revoked`
  - `drivers.identification_issued_at` `timestamptz null`
  - `drivers.identification_external_ref` `text/varchar null`
- **Backfill:** todos los drivers existentes → `pending_pickup` (candado ON). No auto-`issued`.
- Drizzle schema `drivers.ts` al día.
- Default al crear driver nuevo: razonable `pending_pickup` **o** setear en primer approve; no dejar null.

#### 1.2 Approve paths (eje A + set eje B)
Archivos:
- `apps/backend/src/features/admin/service.ts` → `reviewDriver`
- `apps/backend/src/features/admin/approve.ts` → one-click token
- `apps/backend/src/features/admin/notifications.ts` → copy

Al **approve**:
- Mantener semántica actual de plataforma (status/admin_review/docs).
- Set `identification_status = pending_pickup` si aún no es `issued` (no pisar `issued` en re-approve edge).
- **Copy mail/push:** docs aprobados → **ir a tránsito a retirar identificación/stickers**; **PROHIBIDO** “ya podés conducir / empezar a usar Lifty” como si el volante estuviera libre.
- Reject: sin cambios de identification requeridos (queda pending o lo que corresponda; no issued).

List/detail admin API: devolver `identification_status`, `identification_issued_at`, `identification_external_ref` (+ distrito si ya está).

#### 1.3 `toggleOnline` + status
- `apps/backend/src/features/drivers/service.ts`
- Tras gates existentes, si `is_online=true` y `identification_status !== 'issued'` → error estable **`STICKERS_REQUIRED`** (403 o 409; **un solo código** en toda la API; documentar en AGENTS).
- Si `revoked` → mismo bloqueo (y si estaba online, forzar offline en el path de revoke futuro; MVP puede solo denegar online).
- `getStatus` / payload que consume mobile: exponer `identification_status` (y flag derivado claro tipo `can_go_online` o que la app derive).

#### 1.4 Bridge interno
Nueva feature preferida: `apps/backend/src/features/transit-bridge/` (o bajo admin si queda más limpio; una sola casa).

```
POST /api/internal/transit/identification/issue
```

Auth (elegí **uno** y documentalo en `transit-bridge.md` al merge):
- `Authorization: Bearer <TRANSIT_BRIDGE_SECRET>` **o**
- `X-Transit-Bridge-Secret: <TRANSIT_BRIDGE_SECRET>`
- Comparación **time-safe**; fail closed si env ausente en esa ruta.
- **No** JWT conductor. **No** role admin required (es server-server).

Body objetivo:
```json
{
  "driver_id": "uuid-lifty-drivers-id",
  "issued_at": "ISO-8601 optional",
  "external_ref": "optional",
  "district_id": "optional"
}
```

**Resolver MVP:** preferí `driver_id` = PK `drivers.id`. Si implementás fallback DNI/phone/plate, debe ser unívoco (0 o >1 → 404/409 sin side effects) y documentado.

Efectos success:
1. `identification_status=issued`
2. `identification_issued_at = issued_at ?? now`
3. `external_ref` si viene
4. Push best-effort conductor (tipo opcional `identification:issued`)
5. Log estructurado sin secret ni PII de más

No side effects:
- No cambia admin_review/status plataforma
- **No** auto `is_online=true` (el humano conecta)
- No toca documentos

Idempotencia: ya `issued` → 200 ok.  
Si plataforma no approved / rejected / suspended → **409** `PLATFORM_NOT_APPROVED` (no issued).  
Tests matrix en `transit-bridge.md`.

Env:
- Backend: `TRANSIT_BRIDGE_SECRET` en `.env.example` **placeholder** (nunca secret real committed).
- Documentar en `apps/backend/AGENTS.md`.

Mount routes en el router root (`apps/backend/src/index.ts` o equivalente). Prefijo real de API del monorepo: respetar cómo se montan hoy `/api/...` (admin hoy aparece como `/admin` detrás del prefix global — **mirar index** y ser consistente; el path canónico del contrato es `/api/internal/transit/identification/issue`).

#### 1.5 Tests backend (obligatorio)
- Approve → online → `STICKERS_REQUIRED`
- Issue bridge → online OK (con approved + district + no docs pending)
- Bridge sin secret / secret mal → deny
- Driver inexistente → 404
- Issue idempotente
- JWT driver no puede issue
- Copy/notifications: al menos no regresar el texto “ya podés conducir” en approve si hay assertion fácil; si no, checklist manual en PR

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /home/marti/Documentos/LIfty/software-lifty
bun --filter @lifty/backend test
# o bun run test desde root
```

Migración: el humano/ops puede tener que `supabase db push` / SQL Editor. Dejá la migración lista; si no podés pushear remote, documentá el comando y el SQL.

---

### Phase 1b — Mobile conductor (mínimo viable UX)

Objetivo: aprobado plataforma **entra a la app**, ve recordatorio de tránsito, **no conecta** hasta `issued`.

Archivos típicos (descubrir nombres exactos en árbol; no inventar si movieron):
- Types/zod status: `apps/mobile/src/api/**` o schemas de driver status
- Routing post-auth: `postAuthRouting` / watchers de auth
- Home / Active / Online toggle — banner + disable connect
- Manejo error API `STICKERS_REQUIRED` (snackbar/copy clara)
- Opcional: handler push `identification:issued`

**Producto UX:**
- Si `status/admin approved` y `identification_status=pending_pickup`:
  - **No** mentir “cuenta lista para manejar”
  - Banner persistente: “Retirá los stickers / identificación en tránsito de tu municipio. Cuando te los entreguen, vas a poder conectarte.”
  - Toggle/CTA conectar deshabilitado o con feedback bloqueado (mismo patrón que `connectBlocked` / docs under review si ya existe)
- Si `issued` + resto de gates: flujo online normal
- Theme: `apps/mobile/src/theme/index.ts` tokens (`deepBlue`, `turquoise`, etc.) — no hardcode random

No tocar `apps/mobile-passengers` salvo sorpresa de tipos compartidos (no debería).

```bash
bun --filter @lifty/mobile typecheck
bun --filter @lifty/mobile test   # si aplica al scope
```

---

### Phase 2 — `apps/admin` con **shadcn** (panel bonito y completo MVP)

#### Stack lock
- Vite + React 19 + TypeScript
- Tailwind v4 (alineado a ecosistema actual; web-transito ya usa TW4+shadcn — podés mirar patrones **sin** copiar su Supabase)
- **shadcn/ui** init en el package (`components.json`, Radix, `cn()`, sonner toasts, etc.)
- React Router
- TanStack Query recomendado para pending/detail
- Supabase JS client (session Lifty) + `fetch`/`api` helper con `Authorization: Bearer <access_token>`
- Package name: `@lifty/admin`
- Port dev: p.ej. **5174** (evitar choque con web-transito 5173 si corren juntos) — documentar en README del app

#### Scaffold
```
apps/admin/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  components.json          # shadcn
  .env.example             # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
  src/main.tsx
  src/App.tsx
  src/index.css            # tokens Lifty
  src/lib/supabase.ts
  src/lib/api.ts
  src/lib/utils.ts
  src/components/ui/*      # shadcn
  src/components/layout/*  # shell: sidebar + topbar
  src/pages/LoginPage.tsx
  src/pages/PendingQueuePage.tsx
  src/pages/DriverDetailPage.tsx
  src/pages/UnauthorizedPage.tsx  # opcional
```

Root:
- workspaces ya `apps/*`
- script `"dev:admin": "bun run --filter @lifty/admin dev"`
- turbo typecheck/build si aplica
- Root `AGENTS.md`: mencionar admin + `bun run dev:admin`
- **NO** cablear en `scripts/dev-all.ts` (estabilidad QR Expo)

#### Auth / gate de rol
1. Login email+password (o magic link si ya es el patrón Lifty admin — **preferí el mismo método que usen users admin hoy** en Supabase Lifty; email/password es OK MVP).
2. Session Supabase → access token a API.
3. Tras login: `GET` pending o `/auth/me` (lo que exista) y exigir `users.role === 'admin'`.
4. Si no admin → signOut + pantalla “No autorizado”.
5. Rutas protegidas; redirect a login si no hay session.

#### Pantallas MVP (completas, no stub vacío)

**Login**
- Brand Lifty (logo si hay asset en monorepo/`web-Lifty` — opcional plate claro si wordmark oscuro)
- Form limpio shadcn (Card, Input, Button, toast errores)
- Colores marca: turquesa `#00C2B3` / `#1BBFAE`, navy `#0F2A44`, fondos claros `#EDF1F5` / white

**Shell**
- Sidebar desktop: “Pendientes”, (opcional disabled “Comisiones” Phase 3), logout
- Contenido wide; tabla responsive
- Dark/light: preferí **light ops** legible (docs photos); no forzar dark navy entero tipo tránsito

**Cola pendientes** (`GET /api/admin/drivers/pending` — confirmar prefix real)
- Tabla shadcn: nombre, email/phone, fecha, docs count, kyc, status
- Click fila → detalle
- Empty state lindo (“No hay conductores en review”)
- Loading skeletons
- Refresh / invalidación react-query
- Badge count en nav

**Ficha conductor** (`GET /api/admin/drivers/:id`)
- Header: nombre, contactos, fechas
- Badge **Review plataforma**: pending/approved/rejected
- Badge **Identificación / stickers**: `pending_pickup` | `issued` | `revoked` (solo lectura; copy humana “Pendiente retiro en tránsito” / “Emitida” / “Revocada”)
- KYC + verified name + last4 si vienen
- Vehículos
- Documentos: grid/cards con preview si `file_url` es imagen; link abrir pestaña si PDF; estado por doc
- Notas (textarea)
- Acciones primarias:
  - **Aprobar** → confirm dialog shadcn → `POST .../review` `{ action: 'approve', notes }`
  - **Rechazar** → dialog + notes requeridas o recomendadas → `action: 'reject'`
- Toasts éxito/error; al aprobar, volver a cola o mostrar estado actualizado en ficha
- No botón “marcar stickers entregados” en MVP

**Calidad UI (humano pidió shadcn “bien bonito” y completo)**
- Tipografía coherente (Geist o Inter via shadcn default OK)
- Espaciado generoso, cards, separators
- Estados: loading / empty / error boundary o page error con reintentar
- Accessible buttons, focus rings
- No página en blanco con un `<button>Approve</button>` crudo

#### Env admin `.env.example`
```
VITE_SUPABASE_URL=https://wabddbkwugepkwrgzhpk.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://127.0.0.1:3001
```
(Ajustar API URL al port real del backend monorepo — **3001** en dev-all; no hardcodear mal.)

---

## Qué NO hacer
- No unificar Supabase Lifty + tránsito
- No implementar ventanilla de stickers en `apps/admin`
- No meter web-transito dentro del monorepo
- No soft-gate (online permitido sin stickers “con warning”)
- No self-report del conductor como issue
- No auto-online al issue del bridge
- No force-issue admin MVP
- No rehacer DIDIT / onboarding completo
- No tocar passengers salvo necesidad real
- No secretos en git; no loguear `TRANSIT_BRIDGE_SECRET`
- No meter admin en `scripts/dev-all.ts`
- No deploy prod / Vercel monorepo (no hay CD prod Lifty admin aún)
- No “arreglar” web-transito Vercel/login en este PR (otro track)

---

## Integración web-transito (este PR monorepo: contrato listo)

Al final, actualizá `specs/spec-admin-panel-stickers-gate/transit-bridge.md` con:
- path/header finales
- resolver elegido (`driver_id`)
- ejemplo `curl` de dev **sin** secret real

Checklist para el equipo tránsito (copiar en PR body; **no** tenés que implementarlo en web-transito en este mismo PR salvo que el humano diga lo contrario):

1. Server-side only `TRANSIT_BRIDGE_SECRET` (= mismo string que backend Lifty)
2. `LIFTY_API_URL` (dev LAN vs host)
3. Tras commit local “entregado” → POST issue
4. Manejar 4xx/5xx sin mentir al operador; retry idempotente
5. Guardar `drivers.id` Lifty cuando el conductor quede habilitado a retiro

Si el humano más adelante pide el PR en `web-transito`, otro handoff.

---

## Criterios de aceptación

### Backend
- [ ] Migración + drizzle con `identification_*`
- [ ] Approve API + one-click setean `pending_pickup` y **no** habilitan online solos
- [ ] Copy approve ya no dice que puede conducir de inmediato
- [ ] `toggleOnline(true)` sin `issued` → `STICKERS_REQUIRED`
- [ ] Bridge issue con secret → `issued`; online OK si resto de gates
- [ ] Bridge auth fail / idempotencia / PLATFORM_NOT_APPROVED testeados
- [ ] `GET` status expone identification al mobile
- [ ] Admin list/detail incluyen identification fields

### Mobile
- [ ] Approved + pending_pickup: entra app, banner tránsito, no connect
- [ ] Issued: puede connect (con district etc.)
- [ ] Error `STICKERS_REQUIRED` manejado

### apps/admin (shadcn)
- [ ] `bun run dev:admin` levanta UI
- [ ] Login; non-admin rechazado
- [ ] Cola pending real contra API
- [ ] Ficha con docs + badges review + stickers
- [ ] Approve/reject funciona y se refleja en DB
- [ ] UI pulida shadcn (no stub)
- [ ] `.env.example` + script root

### Docs
- [ ] SPEC companions actualizados si cambió path/header
- [ ] `apps/backend/AGENTS.md` + root `AGENTS.md` tocados
- [ ] PR describe flujo E2E en criollo

---

## Verify

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /home/marti/Documentos/LIfty/software-lifty

bun install
bun run lint
bun run typecheck
bun run test
# admin
bun run dev:admin   # smoke manual login + cola
# backend bridge smoke (secret de dev local, no commitear)
# curl -sS -X POST "$API/api/internal/transit/identification/issue" \
#   -H "Authorization: Bearer $TRANSIT_BRIDGE_SECRET" \
#   -H "Content-Type: application/json" \
#   -d '{"driver_id":"<uuid>"}'
```

Migraciones: seguir `apps/backend/AGENTS.md` (`supabase db push` / repair). No inventar prod deploy.

---

## Entrega
1. Branch + commits convencionales + **PR a main**
2. Summary 5–10 líneas: flujo E2E + qué quedó out of scope
3. Test plan checkboxes (backend tests + smoke admin + mobile)
4. Lista archivos clave tocados
5. Nota ops: backfill `pending_pickup`; cómo setear `TRANSIT_BRIDGE_SECRET` local; port admin
6. Sin `.env`, sin service_role, sin secretos

## Empezá ya
1. Leer SPEC completa  
2. Inspeccionar `admin/service|approve|notifications`, `drivers/service` toggleOnline, mount routes, schema drivers  
3. Migración + gate + tests  
4. Bridge + tests  
5. Copy + mobile mínimo  
6. Scaffold `apps/admin` shadcn completo MVP  
7. Docs + PR  

KISS en lógica de negocio; **no** KISS de “panel feo a medias” — el humano pidió shadcn completo y bonito para ops diario.
