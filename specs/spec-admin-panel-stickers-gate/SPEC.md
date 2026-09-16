---
id: SPEC-admin-panel-stickers-gate
companions:
  - architecture.md
  - transit-bridge.md
  - affected-files.md
sources:
  - docs/brainstorms/2026-04-02-admin-panel-y-transito-logos.md
  - .hermes/plans/2026-09-11_124605-admin-panel-decisions-locked.md
  - docs/superpowers/specs/2026-07-19-email-based-driver-approval-design.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete contract for what to build, test, and validate.

# Admin panel Lifty + hard gate de stickers (tránsito externo)

## Why

1. **Ops sin panel.** La aprobación de conductores hoy vive en mail one-click + API (`features/admin`). No hay UI en el monorepo. Eso no escala para revisar docs todos los días.
  2. **Una sola Supabase de negocio (`wabdd…`).** Admin, web-tránsito, mobile y backend comparten el mismo Auth issuer + Postgres. Las mutaciones sensibles de ops siguen pasando por la API Elysia (no PostgREST cruzado improvisado).
3. **Regla de negocio cerrada:** sin stickers retirados en tránsito, el conductor **no puede conducir** (`is_online` bloqueado). Hoy, al aprobar docs, el backend pone `status=approved` y el copy dice que ya puede usar Lifty — eso **salta** el paso tránsito.

## Decisiones locked (no reabrir en implementación)

| # | Decisión | Valor |
|---|----------|--------|
| D1 | Dónde vive el panel ops | `LIfty/apps/admin` (fuera del monorepo, hermano de `software-lifty`) |
| D2 | Web de tránsito en este monorepo | **No.** Ya existe fuera del repo. |
| D3 | Stickers vs online | **Plazo + suspensión.** Tras approve de plataforma el conductor **puede** conectarse. Recordatorio reforzado desde día **20**. Si a los **30 días** no retiró stickers/logos → cuenta **suspendida** (no `is_online`) hasta que tránsito emita. `revoked` sigue bloqueando. |
| D4 | Quién marca “stickers entregados” | **Web-tránsito** (sistema de verdad de la entrega física). |
| D5 | Auth + datos | **Misma Supabase canónica `wabdd…`.** Mutaciones de stickers vía API JWT `role=transit|admin` (`/api/transit/*`) y/o bridge secret server-to-server. No PostgREST directo para issue. |
| D6 | Ejes de estado | **Dos ejes:** (A) review plataforma docs/KYC · (B) identification stickers. |

## What changes (por fase)

### Phase 1 — Hard gate stickers + puente (backend + mobile mínimo) ← núcleo de negocio

Sin esto el panel admin aprueba gente que igual no debería manejar, o el candado nunca se abre.

1. **Modelo en Lifty DB** (ver `architecture.md`):
   - `drivers.identification_status`: `pending_pickup | issued | revoked`
   - `drivers.identification_issued_at` (nullable timestamptz)
   - `drivers.identification_external_ref` (nullable text — id/audit del lado tránsito, opcional)
2. **Al aprobar review de plataforma** (`adminService.reviewDriver` approve + `approveDriver` one-click):
   - Sigue: `admin_review_status=approved`, docs pending → approved, etc.
   - **Cambia:** no habilitar conducción plena solo por eso.
   - Setear `identification_status=pending_pickup` (si aún no `issued`).
   - Copy mail/push: docs OK → **retirar identificación en tránsito**; **no** “ya podés conducir”.
3. **`toggleOnline(true)` / plazos stickers** (ancla = `approved_at` / `admin_reviewed_at`):
   - `pending_pickup` **&lt; 30d** → online **permitido** (banner retiro; refuerzo desde día 20).
   - `pending_pickup` **≥ 30d** → 409 `STICKERS_PICKUP_OVERDUE` + fuerza offline (cuenta **suspendida**).
   - `revoked` → 409 `STICKERS_REVOKED`.
   - `issued` → sin bloqueo por stickers.
4. **`GET /drivers/me/status`** expone `identification_status` + fase derivada (`grace` | `reminder` | `paused` | …) y flags (`identification_blocks_online`, días hasta suspensión).
5. **Endpoint interno de puente** (detalle en `transit-bridge.md`):
   - `POST /api/internal/transit/identification/issue`
   - Auth: secret compartido (header), **no** JWT de usuario conductor.
   - Efecto: `identification_status=issued`, timestamp, opcional external_ref; push al conductor; desbloquea si estaba suspendido.
6. **Mobile conductor (mínimo):**
   - Si docs/admin OK y stickers `pending_pickup` en gracia/reminder: **puede conectar**; cartel de retiro + contador a 30d.
   - Si fase `paused` (≥30d): **toggle bloqueado** + cartel “cuenta suspendida por no retirar stickers/logos”.
   - Manejar `STICKERS_PICKUP_OVERDUE` / `STICKERS_REVOKED` (y legacy `STICKERS_REQUIRED` si aparece).
   - Cuando status pase a `issued`, quitar banner y seguir con district + docs gates.

### Phase 2 — Admin ops MVP (`/home/marti/Documentos/LIfty/apps/admin`)

Web desktop-first **fuera** del monorepo (mismo nivel que `web-transito`):

1. Login Supabase Lifty; solo `users.role === 'admin'` (403/redirect si no).
2. Cola pendientes → `GET /admin/drivers/pending`.
3. Ficha → `GET /admin/drivers/:id` (persona, KYC, vehículos, docs con preview/link, distrito).
4. Aprobar / rechazar + notes → `POST /admin/drivers/:id/review`.
5. En ficha: badge **Identificación:** pendiente retiro / emitida / revocada (solo lectura en MVP).
6. Dev: `cd ../apps/admin && bun run dev` (:5174). **No** workspace monorepo / **no** `dev-all`.

### Phase 3 — (opcional, fuera del MVP de esta SPEC si no hay tiempo)

- Thin UI commission / fuel / cancellations ya expuestos por API admin.
- Override soporte “force issue” en admin (default **no** en MVP).
- Mail admin CTA → deep link a ficha del panel en vez de solo one-click.

## Capabilities

- id: CAP-1
  phase: 1
  intent: Tras aprobar docs en Lifty, el conductor queda `pending_pickup` y **puede** ponerse online durante la gracia (hasta 30d).
  success: approve → `identification_status=pending_pickup` + `approved_at` set; `PUT .../online {is_online:true}` → 200 en gracia; status expone `identification_phase=grace|reminder`.

- id: CAP-1b
  phase: 1
  intent: A los 30 días sin retiro, la cuenta se suspende hasta emisión en tránsito.
  success: con `approved_at` hace ≥30d y `pending_pickup`, online → 409 `STICKERS_PICKUP_OVERDUE`; tras bridge issue → online OK.

- id: CAP-2
  phase: 1
  intent: Cuando web-tránsito confirma entrega, Lifty marca identificación emitida y limpia el plazo/pausa.
  success: `POST /api/internal/transit/identification/issue` con secret válido y driver resoluble → `identification_status=issued` + `identification_issued_at` set; el mismo driver puede `toggleOnline(true)` si cumple el resto de gates (approved, district, no docs pending).

- id: CAP-3
  phase: 1
  intent: El puente no es usable sin secret ni por conductores normales.
  success: Request sin header secret → 401/403; request con JWT de driver a esa ruta → no autoriza; secret inválido → rechazo. No queda endpoint público análogo al approve-by-token para stickers.

- id: CAP-4
  phase: 1
  intent: La app conductor comunica plazos de retiro sin bloquear online en gracia, y muestra cartel de suspensión a los 30d.
  success: status incluye fase/flags; UI banner de retiro en gracia/reminder; bloquea + cartel suspensión en `paused`; mail/push de approve mencionan plazo 30d.

- id: CAP-5
  phase: 2
  intent: Un admin Lifty revisa la cola y aprueba/rechaza desde `LIfty/apps/admin` sin depender del mail one-click.
  success: Login admin → lista pending → ficha con docs → approve/reject refleja en DB igual que la API actual; usuario `role=driver` no entra al panel.

- id: CAP-5b
  phase: 2
  intent: El panel lista **todos** los conductores registrados (no solo pendientes), con ID operativo = DNI (`document_number`) y datos útiles de ops.
  success: `GET /admin/drivers` + pantalla Conductores; columnas DNI/registry_id, contacto, municipio, review, stickers/fase, patente, online; búsqueda por DNI/nombre/tel.

- id: CAP-6
  phase: 2
  intent: El panel muestra el estado de stickers (dato Lifty) sin implementar ventanilla de entrega.
  success: Ficha driver muestra badge según `identification_status` + fase plazo; no hay botón MVP “marcar entregado” (eso es tránsito).

## Constraints

- **Una sola Supabase canónica (`wabdd…`)** para Auth paneles + backend + mobile. Legacy `dlqvos` / `ykchnss` retired after cutover (freeze, no delete day-0).
- **No construir UI de tránsito** ni rol `transit` en `apps/admin`.
- **No self-report** del conductor (“ya retiré stickers”) como camino feliz.
- **Plazo stickers en backend** (no solo UI): gracia/reminder online OK; suspensión ≥30d y `revoked` bloquean como `documents_pending_review`.
- Gates existentes se **conservan y acumulan**: `documents_pending_review`, `status===approved`, `district_id`, **más** bloqueo stickers solo si suspendido/revocado.
- One-click `GET /admin/approve?token=` se alinea al mismo semántica de approve plataforma + `pending_pickup` (no bypasea stickers).
- Secret del puente solo en env server-side (`TRANSIT_BRIDGE_SECRET` o nombre acordado); nunca en apps mobile ni en `VITE_*` públicos.
- Proyecto sigue **sin prod CD**; admin y bridge en dev/local hasta que el monorepo cambie de status.

## Non-goals

- Contabilidad, chat soporte, mapa live ops, SOS console.
- App nativa para personal de tránsito.
- Reemplazar DIDIT / rehacer onboarding completo.
- Migrar web-tránsito dentro del monorepo.
- Compartir service_role entre las dos Supabase.
- Definir sede/horarios/copy legal municipal (lo aporta tránsito / ops humano).

## Open questions (técnicas — cerrar en implementación o addendum)

1. **Clave de join del puente:** `driver_id` UUID Lifty (preferido si tránsito lo puede guardar) vs DNI / teléfono / patente. La ruta debe documentar el resolver elegido en `transit-bridge.md` al implementar.
2. **Backfill** filas ya `status=approved` en data actual: default recomendado `identification_status=pending_pickup` (candado on) salvo lista explícita grandfather `issued`.
3. **Revoke:** ¿tránsito puede revocar stickers vía bridge? MVP puede ser solo `issue`; `revoked` en enum para el futuro + force offline si se implementa.
4. ¿Push al admin cuando hay pending ya cubierto por mail actual? No bloquear Phase 1.

## Success signal

- Phase 1: tests backend cubren approve → online denied → issue bridge → online ok; typecheck/lint OK; mobile no invita a conducir sin stickers.
- Phase 2: `LIfty/apps/admin` en dev permite el loop completo de review; conductor no-admin no entra.
- Misma Supabase `wabdd`; paneles consumen datos de conductores vía API (`/api/admin/*`, `/api/transit/*`); bridge secret opcional server-to-server.

## Order of work (implementación)

1. Migración + schema drizzle `identification_*`
2. Approve paths + `toggleOnline` + `getStatus` + tests
3. Bridge route + tests de auth secret
4. Copy notifications + mobile mínimo
5. Scaffold `LIfty/apps/admin` (fuera monorepo) + cola/ficha/review + badge
6. Documentar para el equipo de web-tránsito el payload del bridge (`transit-bridge.md` final)
