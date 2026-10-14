# EAS Update (OTA) — Conductor + Pasajero

Actualizaciones **JS/TS** sin recompilar AAB. Play Store **no** hace OTA; lo hace **EAS Update**.

## OTA ≠ native (no mentir)

| Cambio | Canal |
|--------|--------|
| JS/TS, pantallas, estilos, copy, lógica, assets no nativos | **EAS Update** (`eas update --channel …`) |
| Plugin nativo, permiso nuevo, upgrade Expo/RN, icono/splash nativo, `google-services`, bump `expo.version` / store | **EAS Build AAB** + Play |
| Solo API | Railway (ya) |

No existe “nunca más compilar”. Existe “casi nunca para fixes de UI/lógica”.

## Projects (dos EAS distintos)

| App | Path | Display name | projectId | Package | Channel production |
|-----|------|--------------|-----------|---------|-------------------|
| Conductor | `apps/mobile` | **Lifty Conductor** | `90f11dff-37cf-4b27-b6e8-598491a871c5` | `com.lifty.conductor` | `production` |
| Pasajero | `apps/mobile-passengers` | **Lifty** | `97a435a9-6725-4207-a930-c11ec77c7de5` | `com.lifty.passenger` | `production` |

- `runtimeVersion.policy`: **`appVersion`** — OTA válido mientras `expo.version` no cambie.
- Si subís `version` o tocás native → **nuevo AAB** (y ese binario es el que recibe updates del channel).

## Primer ship (obligatorio después de merge OTA)

Los AAB viejos **sin** `expo-updates` embebido **no** reciben OTA.

1. Merge PR OTA a `main`.
2. Build production AAB **con ese commit**:
   ```bash
   bun run eas:login   # una vez, owner martiyaquinta
   bun run eas:build:android:production
   # o por app:
   bun run eas:build:android:production:driver
   bun run eas:build:android:production:passenger
   ```
3. Subí esos AAB a Play (internal draft) — ver `docs/runbooks/play-store-two-apps.md`.
4. Instalá el internal build en device de prueba.

## Día a día (solo JS)

Desde monorepo root (logueado EAS):

```bash
# ambas apps, channel production
bun run eas:update:production -- "fix: copy en home conductor"

# una sola app
bun run eas:update:production:driver -- "fix: …"
bun run eas:update:production:passenger -- "fix: …"

# preview APKs (channel preview)
bun run eas:update:preview -- "chore: smoke OTA preview"
```

Equivalente directo:

```bash
bash scripts/eas-update.sh apps/mobile production "fix: …"
bash scripts/eas-update.sh apps/mobile-passengers production "fix: …"
```

Message: argv después de `--`, o env `EAS_UPDATE_MESSAGE`.

## Verificar

```bash
cd apps/mobile && bunx eas-cli update:list --branch production
# o dashboard: https://expo.dev → project → Updates
```

En device: abrir la app instalada desde el AAB **post-OTA**, background/foreground o cold start; el update se aplica según config (`fallbackToCacheTimeout: 0` = no bloquear splash esperando red).

## Rollback

Publicar de nuevo un update anterior del mismo channel/runtime:

```bash
cd apps/mobile
bunx eas-cli update:republish --group <GROUP_ID> --non-interactive
# o listar y republish el group previo
bunx eas-cli update:list
```

(Pasajero: mismo comando en `apps/mobile-passengers`.)

Si no hay group seguro: publicá un update nuevo que revierta el cambio de código (`eas update` con el commit bueno).

## Cuándo NO uses OTA

- Cambió `app.json` plugins / permisos / icon / splash nativo
- Cambió `expo.version` (policy appVersion)
- Nueva native dep o upgrade SDK
- Rotar secrets bakeados en el binario (`EXPO_PUBLIC_*` del **build**) — OTA no re-bakea env nativo del AAB mágicamente; rebuild

## CI (opcional)

Workflow: `.github/workflows/eas-update-production.yml` — **solo** `workflow_dispatch`.

1. Creá secret de repo `EXPO_TOKEN` (Expo → Access tokens). **No** commitear el token.
2. Actions → “EAS Update production” → Run workflow → app `driver|passenger|both` + message.

Si falta el secret, el job falla con mensaje claro (no corre en push automático).

**No** hay auto-submit a Play production en este flujo.

## Scripts root (referencia)

| Script | Qué hace |
|--------|----------|
| `eas:build:android:production` | AAB production ×2 (channel `production`) |
| `eas:build:android:preview` | APK preview ×2 (channel `preview`) |
| `eas:update:production` | OTA channel production ×2 |
| `eas:update:preview` | OTA channel preview ×2 |
