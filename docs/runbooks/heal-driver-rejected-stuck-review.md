# Heal: conductor stuck `rejected` sin Aprobar/Rechazar (ops)

Caso típico: notas viejas (#347) o reject hard dejaron `status=rejected` / `admin_review_status=rejected`. El conductor re-subió docs pero la ficha admin no muestra botones y no está en Pendientes.

**No pegar PII (email/nombre) en tickets públicos ni commits.**

## Preferido (post-deploy de este fix)

1. Redeploy Railway al tip de `main` (incluye soft notes #348, partial reupload #349, y heal on detail).
2. Abrir la ficha en admin (`GET /admin/drivers/:id`).
3. Backend llama `ensureDriverEnteredReview`: si required docs OK → `status=review`, `admin_review_status=pending`, `documents_pending_review=true`.
4. Refetch → aparecen **Aprobar / Rechazar**.
5. Alternativa: `GET /admin/drivers/pending` también reconcilia rejected+complete.

## SQL controlado (solo si deploy no alcanzó / emergencia)

En Supabase SQL Editor (wabdd), **identificar el driver por ops** (email interno, no en git):

```sql
-- 1) Inspección (reemplazar :driver_id)
SELECT id, status, admin_review_status, documents_pending_review,
       admin_reviewed_at, admin_review_notes IS NOT NULL AS has_notes
FROM drivers
WHERE id = :driver_id;

SELECT doc_type, status, created_at
FROM driver_documents
WHERE driver_id = :driver_id AND status <> 'superseded'
ORDER BY doc_type, created_at;

-- 2) Solo si docs required están completos (no rejected/superseded) y status=rejected:
UPDATE drivers
SET
  status = 'review',
  admin_review_status = 'pending',
  admin_reviewed_by = NULL,
  admin_reviewed_at = NULL,
  admin_review_notes = NULL,
  documents_pending_review = true,
  updated_at = now()
WHERE id = :driver_id
  AND status = 'rejected';

-- Opcional: docs activos a pending_review si quedaron rejected y deben re-verse
-- (NO borrar historial superseded)
-- UPDATE driver_documents SET status = 'pending_review'
-- WHERE driver_id = :driver_id AND status = 'rejected' AND doc_type = :doc_type;
```

3. Refetch ficha admin → botones.
4. No mass-reject docs al “arreglar”.

## Railway checklist (humano)

1. GitHub monorepo: #348 y #349 **MERGED**; este fix mergeado a `main`.
2. Railway `liftybackend-production` → Redeploy from latest `main`.
3. Smoke: `GET /health` 200.
4. Soft notes en prod: Enviar al conductor **no** deja rejected.
5. Caso stuck: abrir ficha → heal automático o SQL de arriba.
