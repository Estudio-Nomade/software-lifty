# Runbook — Web Push PWA (Lifty Admin)

Notificaciones cuando un conductor entra a **review** (`notifyAdminNewDriver`), además del mail Resend.

## Piezas

| Pieza | Dónde |
|-------|--------|
| Send + VAPID + subscribe API | monorepo backend (`web-push`, `#340`) |
| Opt-in UI + SW | lifty-admin (`PushAlertsCard`, `src/sw.ts`) |
| Schema | migración `0044_push_tokens_web.sql` |

## 1) DB (Supabase wabdd)

SQL Editor o pooler:

```sql
ALTER TABLE "push_tokens" ALTER COLUMN "token" TYPE text;
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "web_p256dh" text;
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "web_auth" text;
```

O con `DATABASE_URL` del Transaction pooler:

```bash
cd apps/backend
bun run scripts/apply-web-push-migration.ts
# o: psql "$DATABASE_URL" -f src/shared/db/migrations/0044_push_tokens_web.sql
```

## 2) VAPID (Railway backend)

```bash
cd apps/backend && bunx web-push generate-vapid-keys
```

Variables en Railway (service API):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@liftyviajes.com
ADMIN_APP_URL=https://<tu-admin-vercel>
```

Redeploy. Sin VAPID el mail sigue; el push loguea skip y no crashea.

Keys locales (no git): `/home/marti/Documentos/LIfty/.ops-local/vapid-web-push.env` si se generaron ahí.

## 3) Admin (Vercel)

1. Merge PR push PWA (subscribe UI + injectManifest SW).
2. `VITE_API_URL=https://liftybackend-production.up.railway.app`
3. Opcional: `VITE_VAPID_PUBLIC_KEY=<misma public que Railway>`
4. Deploy prod.

## 4) Ops en el celu

1. Abrir admin en Chrome Android (HTTPS).
2. **Instalar app** / Agregar a inicio (PWA).
3. Login admin.
4. Cola → **Activar alertas** → permitir notificaciones.
5. Smoke: conductor con docs completos → `status=review` → push + mail.

### iOS

Web Push solo en app añadida al inicio (Safari 16.4+). Sin paridad total con Android.

## 5) Verify

```bash
curl -sS https://liftybackend-production.up.railway.app/health
# Con Bearer admin:
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://liftybackend-production.up.railway.app/api/admin/push/vapid-public-key
# → { "publicKey": "B..." }  (no 503 VAPID_NOT_CONFIGURED)
```

## Flujo producto

Registro + docs completos → `drivers.status=review` → Pendientes + notify (mail + web push) → Aprobar → Conductores (`approved`).
