# fix(passengers+backend): pre-assign cancel not labeled as cancelled trip in history

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
Apps: **`apps/backend`** + **`apps/mobile-passengers`**  
Base: `origin/main` tip **`c3761e9`** — `git fetch origin main && git rev-parse origin/main` al arrancar  
Branch: `fix/passenger-preassign-cancel-history-label`  
ClickUp: https://app.clickup.com/t/1dfc7p9x4qz  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Síntoma (Martina / QA)

Cuando el pasajero pide viaje y **no hay conductores** (o cancela mientras busca), al tocar **Cancelar** el viaje aparece en historial como **“Cancelado”** (rojo) y se siente como “viaje cancelado” que suma a cancelados. Producto: **sin conductor asignado no es cancelación de viaje real** — no debe penalizar ni verse igual que cancelar con conductor en camino.

Repro:
1. App pasajero → solicitar viaje sin drivers cerca.
2. En ConnectingDriver (“Buscando…” o “Sin conductores disponibles”) → **Cancelar**.
3. Ir a **Historial de viajes**.
4. Actual: badge **Cancelado** danger.
5. Esperado: no cuenta como cancelación penalizable; en UI se distingue (ej. “Búsqueda cancelada” / “Sin conductor”) y el rate sigue 0.

Dual-OS. HARD STOP EAS.

## Ya en tip — NO re-greenfield rate engine

**#492 MERGED** (`73f0052+`) — STALE greenfield del motor:

| Piece | Tip behavior |
|-------|----------------|
| `evaluateCancel` | `pending`/`offered`/`request_received` sin `assigned_at` → stage **`pre_asignacion`**, fee 0 |
| `recalcPassengerMetrics` | rate solo stages **`en_camino` \| `llegado`**; `pre_assign_cancelations` aparte |
| Test | `pre_asignacion passenger cancel does not count toward cancel rate` |
| `assertPassengerCanRequest` | levanta blocks stale de rate si solo pre_assign |

Verificar en tip antes de codear:

```bash
git grep -n "en_camino', 'llegado" origin/main -- apps/backend/src/features/cancellations/metrics.ts
git show origin/main:apps/backend/src/features/cancellations/service.test.ts | grep -n pre_asignacion
```

Si rate tests fallan en tip → **arreglar regresión**, no reescribir #492.

Este CU residual = **historial / copy / enrich API**, no reabrir motor.

## Arquitectura

```
ConnectingDriver Cancelar
  → POST /passenger/trips/:id/cancel
  → applyCancel → trips.status = 'cancelled'  (siempre, tip)
  → cancelation_log.stage = pre_asignacion | en_camino | llegado
  → recalcPassengerMetrics (#492 free for pre_asignacion)

GET /passenger/trips/history (tip)
  → trips + driver fields
  → NO join cancelation_log
  → UI STATUS_MAP: cancelled* → "Cancelado" danger  ← residual
```

## Hipótesis rank (tip `c3761e9`)

1. **CONFIRMADO UI:** `TripHistoryScreen` trata todo `cancelled*` como “Cancelado” rojo; no lee stage/reason.
2. **CONFIRMADO API:** `getTripHistory` no expone `cancel_stage` / `cancel_reason` / `cancel_actor`.
3. **CONFIRMADO BE status:** pre_assign sigue persistiendo `trips.status = 'cancelled'` (OK para terminal machine; no hace falta status nuevo salvo producto lo pida).
4. Rate engine ya free — si QA aún ve 403 rate block, smoke #492 + blocks DB; no este PR salvo regresión tip.
5. `expired` / `auto_timeout` / `rejected` también pueden verse confusos — incluir labels si salen en el mismo screen (KISS: al menos pre_asignacion + expired sin driver).

## Scope

**IN**
1. **BE** `getTripHistory` (y si el card de detalle de history lo usa, getTripById opcional): left join / subquery a `cancelation_log` → campos:
   - `cancel_stage`: `pre_asignacion` | `en_camino` | `llegado` | null
   - `cancel_reason`: `user_cancel` | `auto_timeout` | … | null
   - `cancel_actor`: `passenger` | `driver` | `system` | null  
   Un log por trip (PK trip_id o limit 1).
2. **Pax types** `Trip` en `api/types.ts` — campos opcionales.
3. **`TripHistoryScreen`**:
   - `pre_asignacion` (+ opcional `expired` / reason `auto_timeout` sin driver) → label **“Búsqueda cancelada”** o **“Sin conductor”**, color `mediumGray` (no danger).
   - `en_camino` / `llegado` / cancel con driver asignado → sigue **“Cancelado”** danger.
   - `expired`/`rejected` sin log: labels ya en STATUS_MAP; alinear copy si hace falta.
4. Tests BE: history row after pre_assign cancel includes `cancel_stage: 'pre_asignacion'`.
5. Smoke manual: cancel search → history no dice “Cancelado” rojo; cancel post-accept sí.

**OUT**
- Re-greenfield #492 metrics/evaluate
- Nuevo `trips.status` enum migration (salvo evidencia dura de que hace falta — preferí enrich)
- Driver TVF / admin dashboard
- Avatar #553 / swipe #552 / map chrome
- EAS, `git add -A`

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/backend/src/features/passenger-trips/service.ts` | `getTripHistory` |
| `apps/backend/src/features/cancellations/*` | SoT stage/reason (#492) — leer, no reescribir |
| `apps/backend/src/shared/db/schema` | `cancelationLog` |
| `apps/mobile-passengers/src/screens/TripHistoryScreen.tsx` | STATUS_MAP / badge |
| `apps/mobile-passengers/src/api/types.ts` | Trip fields |
| `apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx` | cancel path (contexto; no change salvo copy) |
| `apps/backend/src/features/passenger-trips/passenger-trips.test.ts` o cancellations tests | coverage |

## Diseño KISS

```ts
// history select extra (sketch)
cancel_stage: cancelationLog.stage,
cancel_reason: cancelationLog.reason,
cancel_actor: cancelationLog.actor,
// leftJoin cancelationLog on trip_id
```

```tsx
// TripHistoryScreen
function statusMeta(trip: Trip) {
  if (trip.cancel_stage === 'pre_asignacion') {
    return { label: 'Búsqueda cancelada', color: theme.colors.mediumGray };
  }
  if (trip.status === 'expired' || trip.cancel_reason === 'auto_timeout') {
    return { label: 'Sin conductor', color: theme.colors.mediumGray };
  }
  // existing STATUS_MAP…
}
```

Support link “Contactar soporte”: solo cancels **reales** (en_camino/llegado), no pre_assign (o dejarlo — documentá en PR).

## Criterios de aceptación

- [ ] Cancelar en ConnectingDriver (sin driver) → history **no** muestra badge danger “Cancelado” como viaje fallido; copy de búsqueda/sin conductor.
- [ ] Cancelar con conductor aceptado (`en_camino`+) → sigue “Cancelado” y **sí** suma a rate (#492).
- [ ] `total_cancelations` / rate API siguen excluyendo pre_asignacion (tests #492 verdes).
- [ ] History API expone stage/reason en tip.
- [ ] Dual-OS smoke historial.
- [ ] HARD STOP EAS.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
export PATH="$HOME/.bun/bin:$PATH"
git fetch origin main
git checkout -B fix/passenger-preassign-cancel-history-label origin/main

bun --filter @lifty/backend test
# al menos cancellations + passenger-trips history
bun --filter @lifty/mobile-passengers test
bun run typecheck

# smoke Expo Go pax:
# 1) request → cancel search → Historial = Búsqueda cancelada / gray
# 2) request → accept driver → cancel → Cancelado red + rate path
```

## Entrega

1. Conventional commits, subject **lowercase** (commitlint subject-case).
   - Ej: `fix(backend): expose cancel stage on passenger trip history`
   - Ej: `fix(passengers): label pre-assign cancels as search cancelled`
2. No `git add -A`.
3. PR a `main`: ClickUp URL + root cause 3–5 líneas + test plan + nota “#492 rate STALE”.
4. `gh pr comment <N> --body '/review'`
5. Comment ClickUp con PR.
6. **Complete CU solo post-merge**.

## Anti-patrones

- Reabrir metrics allow-list como “fix” principal
- Ocultar todos los cancelled del historial
- Mezclar con avatar/swipe/WhatsApp
- Marcar complete antes del merge
- Inventar status DB sin necesidad
