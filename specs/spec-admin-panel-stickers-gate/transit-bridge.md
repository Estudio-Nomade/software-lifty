# Transit bridge contract — Lifty ↔ web-tránsito

Companion de `SPEC-admin-panel-stickers-gate`.

Las dos apps tienen **Supabase distintas**. Este documento es el único acoplamiento permitido en MVP: HTTP server-to-server hacia el backend Lifty.

## Responsibility split

| System | Owns |
|--------|------|
| Web-tránsito | Ventanilla, stock, operador municipal, “se entregó sticker X”, su propia DB |
| Lifty backend | `identification_status`, plazos 30/90 + pausa online, push al conductor |
| Lifty `apps/admin` | Solo **lee** el estado de identificación en la ficha |

## Endpoint (Lifty) — final

```
POST /api/internal/transit/identification/issue
```

### Auth (implementado)

Preferido:

```
Authorization: Bearer <TRANSIT_BRIDGE_SECRET>
```

Alternativo aceptado:

```
X-Transit-Bridge-Secret: <TRANSIT_BRIDGE_SECRET>
```

- Comparación time-safe (`crypto.timingSafeEqual`).
- Env ausente → **503** `BRIDGE_NOT_CONFIGURED` (fail closed).
- Secret wrong/missing → **401** `UNAUTHORIZED`.
- **No** JWT conductor. **No** role admin.

### Request body

```json
{
  "driver_id": "uuid-lifty-drivers-id",
  "issued_at": "2026-09-13T15:30:00.000Z",
  "external_ref": "optional-id-from-transit",
  "district_id": "optional-uuid-lifty-district"
}
```

### Resolver de identidad (MVP)

**Solo `driver_id`** = PK `drivers.id` en Lifty.

Web-tránsito debe persistir ese id cuando el conductor queda habilitado para retiro.  
No hay fallback DNI/phone/plate en este MVP.

### Responses

| Status | When |
|--------|------|
| 200 | Issue aplicado o idempotente ya `issued` |
| 400 | Body inválido / `issued_at` inválido |
| 401 | Secret missing/wrong |
| 404 | Driver no encontrado |
| 409 | `PLATFORM_NOT_APPROVED` (status/admin_review no approved) |
| 503 | `BRIDGE_NOT_CONFIGURED` |

**Response 200:**

```json
{
  "ok": true,
  "driver_id": "...",
  "identification_status": "issued",
  "identification_issued_at": "...",
  "idempotent": false
}
```

### Idempotencia

Si ya `identification_status=issued` → 200 con `idempotent: true` (no error).

### Side effects on success

1. `identification_status = 'issued'`
2. `identification_issued_at = issued_at ?? now`
3. `identification_external_ref` si viene
4. `district_id` si viene en body (opcional)
5. Push best-effort `identification:issued`
6. Log estructurado (driver id corto; sin secret)

### No side effects

- No cambia `admin_review_status` / `status` plataforma
- **No** auto `is_online=true`
- No toca documentos

## Dev curl (secret de ejemplo — no commitear secret real)

```bash
export TRANSIT_BRIDGE_SECRET='dev-only-change-me'
export API=http://127.0.0.1:3001

curl -sS -X POST "$API/api/internal/transit/identification/issue" \
  -H "Authorization: Bearer $TRANSIT_BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"driver_id":"<uuid-drivers-id>","external_ref":"desk-42"}'
```

## Web-tránsito — checklist de integración

1. `TRANSIT_BRIDGE_SECRET` solo server-side (= mismo string que Lifty backend).
2. `LIFTY_API_URL` (dev LAN vs host) — base sin path o con host; path final `/api/internal/transit/identification/issue`.
3. Tras commit local “entregado” → POST issue.
4. Manejar 4xx/5xx sin mentir al operador; retry idempotente.
5. Guardar `drivers.id` Lifty cuando el conductor quede habilitado a retiro.

## Test matrix (backend) — cubierto en `transit-bridge.test.ts`

1. Issue sin secret → deny  
2. Issue secret mal → deny  
3. Issue driver inexistente → 404  
4. Approve platform → online en gracia → 200  
4b. `approved_at` ≥30d + pending → online → `STICKERS_PICKUP_OVERDUE`  
5. Issue → online → 200 (con district + approved + no docs pending)  
6. Issue dos veces → 200 idempotent  
7. Driver JWT no puede issue  
8. Env secret ausente → 503  
9. Platform not approved → 409  

## Optional later: revoke

```
POST /api/internal/transit/identification/revoke
```

MVP: **out of scope**. Enum `revoked` existe en DB sin ruta.
