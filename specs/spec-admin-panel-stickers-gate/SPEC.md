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
2. **Dos islas de datos.** Lifty y **web-tránsito** usan **Supabase distintas**. Lifty no se entera sola de que el conductor retiró stickers/calcomanías en el municipio.
3. **Regla de negocio cerrada:** sin stickers retirados en tránsito, el conductor **no puede conducir** (`is_online` bloqueado). Hoy, al aprobar docs, el backend pone `status=approved` y el copy dice que ya puede usar Lifty — eso **salta** el paso tránsito.

## Decisiones locked (no reabrir en implementación)

| # | Decisión | Valor |
|---|----------|--------|
| D1 | Dónde vive el panel ops | `LIfty/apps/admin` (fuera del monorepo, hermano de `software-lifty`) |
| D2 | Web de tránsito en este monorepo | **No.** Ya existe fuera del repo. |
| D3 | Stickers vs online | **Hard gate.** Sin identificación emitida → no `is_online`. |
| D4 | Quién marca “stickers entregados” | **Web-tránsito** (sistema de verdad de la entrega física). |
| D5 | Cómo se enteran las dos Supabase | **Puente explícito:** web-tránsito llama API interna de Lifty (no DB compartida, no lectura cruzada). |
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
3. **`toggleOnline(true)`** rechaza si `identification_status !== 'issued'` con código estable `STICKERS_REQUIRED` (403 o 409; un solo código en toda la API).
4. **`GET /drivers/me/status`** expone `identification_status` (y flags derivados claros para la app).
5. **Endpoint interno de puente** (detalle en `transit-bridge.md`):
   - `POST /api/internal/transit/identification/issue`
   - Auth: secret compartido (header), **no** JWT de usuario conductor.
   - Efecto: `identification_status=issued`, timestamp, opcional external_ref; push al conductor “ya podés conectarte”.
6. **Mobile conductor (mínimo):**
   - Si docs/admin OK pero stickers `pending_pickup`: puede estar en home/mapa según routing actual, pero **toggle online bloqueado** + mensaje “Retirá los stickers en tránsito de tu municipio”.
   - Manejar error `STICKERS_REQUIRED` si el backend corta.
   - Cuando status pase a `issued`, permitir online (siguen valiendo district + docs gates existentes).

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
  intent: Tras aprobar docs en Lifty, el conductor queda con identificación `pending_pickup` y **no** puede ponerse online.
  success: `POST /admin/drivers/:id/review` action approve → DB `identification_status=pending_pickup`; `PUT .../online {is_online:true}` → error `STICKERS_REQUIRED`; matching no lo ve online.

- id: CAP-2
  phase: 1
  intent: Cuando web-tránsito confirma entrega, Lifty marca identificación emitida y habilita el gate de stickers.
  success: `POST /api/internal/transit/identification/issue` con secret válido y driver resoluble → `identification_status=issued` + `identification_issued_at` set; el mismo driver puede `toggleOnline(true)` si cumple el resto de gates (approved, district, no docs pending).

- id: CAP-3
  phase: 1
  intent: El puente no es usable sin secret ni por conductores normales.
  success: Request sin header secret → 401/403; request con JWT de driver a esa ruta → no autoriza; secret inválido → rechazo. No queda endpoint público análogo al approve-by-token para stickers.

- id: CAP-4
  phase: 1
  intent: La app conductor comunica el estado “falta tránsito” sin mentir “ya podés manejar”.
  success: `GET /drivers/me/status` incluye `identification_status`; UI bloquea conectar y muestra copy de retiro; push/mail de approve plataforma ya no dicen que puede conducir de inmediato.

- id: CAP-5
  phase: 2
  intent: Un admin Lifty revisa la cola y aprueba/rechaza desde `LIfty/apps/admin` sin depender del mail one-click.
  success: Login admin → lista pending → ficha con docs → approve/reject refleja en DB igual que la API actual; usuario `role=driver` no entra al panel.

- id: CAP-6
  phase: 2
  intent: El panel muestra el estado de stickers (dato Lifty) sin implementar ventanilla de entrega.
  success: Ficha driver muestra badge según `identification_status`; no hay botón MVP “marcar entregado” (eso es tránsito).

## Constraints

- **No unificar Supabase** de Lifty y web-tránsito en esta SPEC.
- **No construir UI de tránsito** ni rol `transit` en `apps/admin`.
- **No self-report** del conductor (“ya retiré stickers”) como camino feliz.
- **Hard gate en backend**, no solo UI (mismo criterio que `documents_pending_review`).
- Gates existentes se **conservan y acumulan**: `documents_pending_review`, `status===approved` (review plataforma), `district_id`, **más** stickers issued.
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
- Las dos Supabase siguen separadas; el único acoplamiento es el contrato HTTP del bridge.

## Order of work (implementación)

1. Migración + schema drizzle `identification_*`
2. Approve paths + `toggleOnline` + `getStatus` + tests
3. Bridge route + tests de auth secret
4. Copy notifications + mobile mínimo
5. Scaffold `LIfty/apps/admin` (fuera monorepo) + cola/ficha/review + badge
6. Documentar para el equipo de web-tránsito el payload del bridge (`transit-bridge.md` final)
