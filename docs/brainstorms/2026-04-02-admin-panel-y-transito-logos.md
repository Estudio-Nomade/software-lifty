# Brainstorm: panel admin Lifty + panel tránsito (logos / identificación)

**Estado:** decisiones de producto cerradas 2026-09-11 — ver plan  
`.hermes/plans/2026-09-11_124605-admin-panel-decisions-locked.md`.  
**Fecha brainstorm:** 2026-04-02 (update 2026-09-11).  
**Repo:** software-lifty (no hay prod; todo local/dev).  
**Contexto:** app tipo Uber para municipios. Conductores deben ir a **tránsito** a retirar logos/calcomanías (auto o casco moto) para identificarse como Lifty.

### Decisiones locked (2026-09-11)

1. Panel ops Lifty → **`apps/admin`** en este monorepo (última app).
2. **No** construir web de tránsito acá: ya vive **fuera** del monorepo.
3. Stickers = **hard gate**: sin identificación emitida por tránsito, el conductor **no puede** `is_online` / conducir.
4. Este monorepo modela estado + bloqueo online + UI ops; la **marca de entrega** la hace la web de tránsito (API/DB compartida a definir).

---

## Respuesta factual (estado actual del monorepo)

### ¿Hoy se informa ir a tránsito a buscar logos?

**No.** No existe modelo ni copy de tránsito / stickers / calcomanías / casco en código ni specs.

Al **aprobar** al conductor:

| Canal | Qué dice hoy | Dónde |
|--------|----------------|--------|
| **Email** | “Tus documentos fueron aprobados. Ya podes empezar a conducir con Lifty.” | `apps/backend/src/features/admin/notifications.ts` → `notifyDriverApproved` |
| **Push** | “Cuenta aprobada” / “Ya podes empezar a usar Lifty.” `data.type = kyc:approved` | `apps/backend/src/features/admin/approve.ts` → `sendPushToUser` |
| **App** | “Verificado” / “Tu cuenta esta lista para empezar” → Online (o SelectProvince si falta district) | `apps/mobile/src/screens/UnderReviewScreen.tsx`, `postAuthRouting.ts` |

Nota: el mail de aprobación se usa en `POST /admin/drivers/:id/review`. El one-click del mail admin (`GET /admin/approve?token=`) manda push; conviene unificar canales cuando se rediseñe.

### Qué hay de “admin” hoy

- **No hay UI de panel** (`apps/admin` no existe).
- **API** en `apps/backend/src/features/admin/`:
  - `GET /api/admin/drivers/pending`
  - `GET /api/admin/drivers/:id`
  - `POST /api/admin/drivers/:id/review` (approve/reject + mail)
  - `GET /api/admin/approve?token=` (público, HTML one-click)
  - comisión, cancelaciones, fuel-price
- Mail a admins al completar docs: ficha + link aceptar (`notifyAdminNewDriver`, `ADMIN_EMAIL` + `users.role = admin`).
- Rol: `users.role` varchar (`admin` / `driver`…); **no** hay rol `transit`.
- Municipios: `districts` + `drivers.district_id` (base multi-municipio).
- Onboarding conductor: profile → KYC (DIDIT) → vehicle → documents → review → approved.
- Spec histórica: `docs/superpowers/specs/2026-07-19-email-based-driver-approval-design.md` (explícito: no había dashboard).

---

## Brainstorm de producto (para retomar)

### Actores (no mezclar permisos)

1. **Ops Lifty (plataforma)** — docs/KYC, comisiones, SOS, suspender, multi-municipio.
2. **Tránsito / municipio** — conductores habilitados por Lifty; entrega de logos; sede/horario; auditoría.
3. **Conductor (app)** — “aprobado Lifty” vs “falta retirar ID en tránsito” vs “puede ir online”.

Un solo web multi-rol **o** dos paneles; recomendación práctica: un `apps/admin` web con roles + filtro por `district_id`.

### Flujo que falta (logos)

```
review (Lifty) → approved_platform
                      ↓
           pending_transit_pickup  ← mail + push + pantalla in-app
                      ↓
           tránsito marca entregado (quién, cuándo, auto/casco, lote)
                      ↓
           identification_complete
```

**Decisión de producto (cerrada 2026-09-11):**

- ~~A – Soft~~ descartada
- **B – Hard gate (ELEGIDA):** `is_online` bloqueado hasta identificación emitida.
- ~~C – Híbrido~~ descartada

### Módulos priorizados

| Fase | Contenido |
|------|-----------|
| 0 | Ya casi backend: cola review, detail, approve/reject, mails |
| 1 | Web Ops MVP: login role admin, cola, ficha, suspend, commission/fuel/cancel APIs |
| 2 | Módulo tránsito: lista por municipio, pending pickup / issued, QR o código en app, registro entrega, CSV |
| 3 | Live ops: mapa online, SOS, métricas por distrito |

### Notificaciones deseadas (gap)

1. Post-aprobación Lifty: “Documentos OK. Retirá identificación en Tránsito [municipio]” (dirección, horarios, qué llevar) — mail + push + banner in-app.
2. Post-entrega tránsito: “Logos cargados; ya podés conectarte” (si hard gate) o recordatorio de circular identificado (si soft).

### Boceto datos (no implementado)

- `identification_status`: `not_required | pending_pickup | issued | revoked`
- `issued_at`, `issued_by_user_id`, items (car/helmet sticker), `pickup_code`
- Política por `district` (exige sticker sí/no, texto sede)
- Rol `transit` o memberships user–district–role

### Decisiones a cerrar antes de codear

1. ¿Sticker bloquea online? (A/B/C) → **B hard gate** ✅
2. ¿Quién marca entregado? → **web de tránsito externa** (no self-report; no UI tránsito en este monorepo) ✅ dirección; falta contrato técnico API/DB
3. ¿Un web o dos? → **ops = `apps/admin` acá; tránsito = repo/app aparte** ✅
4. ¿Dos estados explícitos Lifty vs tránsito? → **sí** (review plataforma ≠ identification issued) ✅ recomendado M1 en plan
5. Copy: “identificación comercial Lifty” ≠ licencia de conducir — pendiente copy final
6. Qué PII ve tránsito — lo define la web externa; admin ops ve ficha completa docs
7. **Abiertas técnicas:** misma Supabase vs webhook; backfill de ya-`approved`; ¿override issued en admin?

### Fuera de scope del primer panel

Contabilidad full, chat soporte, app nativa tránsito, reemplazar DIDIT por revisión manual en ventanilla.

---

## Próximos pasos posibles (cuando se retome)

- [ ] One-pager / PRD BMAD o spec en `docs/` / `specs/`
- [ ] Matriz de pantallas Ops vs Tránsito
- [ ] Cambio mínimo solo copy/estado (aviso “andá a tránsito”) sin panel UI
- [ ] Scaffold `apps/admin` + roles

## Referencias de código

- `apps/backend/src/features/admin/`
- `apps/backend/src/features/admin/notifications.ts`
- `apps/backend/src/features/admin/approve.ts`
- `apps/backend/src/shared/db/schema/drivers.ts`
- `apps/backend/src/features/districts/`
- `apps/mobile/src/screens/UnderReviewScreen.tsx`
- `apps/mobile/src/lib/postAuthRouting.ts`
- `docs/superpowers/specs/2026-07-19-email-based-driver-approval-design.md`
