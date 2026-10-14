# Play Store — Lifty Conductor + Lifty Pasajero

Guía operativa para dejar las **dos** apps Android listas y subirlas a Google Play.
No es un deploy de Railway: la API ya vive en Railway; Play solo recibe el **binario móvil**.

## 0) Mental model

| Cosa | Dónde |
|------|--------|
| API / auth / trips | Railway `https://liftybackend-production.up.railway.app` |
| Nombre en el celu | `expo.name` en cada `app.json` → AAB |
| Listing, capturas, política | Play Console × **2** apps |
| TyC / privacidad web | `https://web.liftyviajes.com/terminos` y `/privacidad` |

| Play app | Path | Nombre | Package |
|----------|------|--------|---------|
| Conductor | `apps/mobile` | **Lifty** | `com.lifty.conductor` |
| Pasajero | `apps/mobile-passengers` | **Lifty Pasajero** | `com.lifty.passenger` |

versionCode es **independiente** por app.

---

## 1) Checklist previa (repo + cloud)

Marcá cada ítem antes de build production.

### Backend
- [ ] `curl -sS https://liftybackend-production.up.railway.app/health` → `"status":"ok"`
- [ ] CORS de Railway incluye orígenes que uses en lab (no bloquea native, sí web)

### Legal público
- [ ] `https://web.liftyviajes.com/privacidad` → HTTP 200
- [ ] `https://web.liftyviajes.com/terminos` → HTTP 200
- [ ] Esas URLs están en Play Console (Privacy policy) ×2

### Config monorepo (esta rama / main post-merge)
- [ ] Sin `android.usesCleartextTraffic`
- [ ] Sin `NSAllowsArbitraryLoads`
- [ ] `expo-notifications` **sin** `mode: "development"`
- [ ] Plugin `expo-location` + textos ES
- [ ] Plugin `expo-image-picker` (+ document-picker en conductor)
- [ ] `eas.json` production → `app-bundle` + `EXPO_PUBLIC_API_URL` Railway
- [ ] EAS env **production** por app:
  - `EXPO_PUBLIC_SUPABASE_URL` = wabdd
  - conductor: `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o anon)
  - pasajero: `EXPO_PUBLIC_SUPABASE_ANON_KEY` (o publishable)
- [ ] Packages no se renombran tarde (`com.lifty.*`)

### Cuenta Google Play
- [ ] Cuenta de desarrollador paga (USD 25 una vez)
- [ ] App creada en Console: **Lifty** (`com.lifty.conductor`)
- [ ] App creada en Console: **Lifty Pasajero** (`com.lifty.passenger`)
- [ ] Play App Signing aceptado (default)
- [ ] Service account / `google-service-account.json` para `eas submit` **o** upload manual del AAB

### Assets listing (×2)
- [ ] Ícono 512×512
- [ ] Feature graphic 1024×500
- [ ] Mín. 2 capturas teléfono (mejor 4–8)
- [ ] Título corto + descripción corta + completa (ES)
- [ ] Categoría, email de contacto, dirección si pide

### Push (recomendado antes de prod abierta; no bloquea internal test)
- [ ] Proyecto Firebase × app o un proyecto con 2 apps Android
- [ ] `google-services.json` en cada app + plugin en `app.json`
- [ ] FCM en EAS credentials

---

## 2) Smoke en device con APK preview (antes del AAB)

Usá los preview APK solo para **probar flujo**, no para Play.

1. Instalá conductor + pasajero en 1–2 Android reales.
2. Confirmá en logs/Metro no aplica: es binario → mirá comportamiento.
3. Checklist funcional mínimo:

| # | Flujo | Pasajero | Conductor |
|---|-------|----------|-----------|
| 1 | Abrir app / splash / welcome | ✓ | ✓ |
| 2 | Registro o login | ✓ | ✓ |
| 3 | GPS + mapa | ✓ | ✓ |
| 4 | Pedir viaje / recibir oferta | ✓ | ✓ |
| 5 | Aceptar / en camino / chat | ✓ | ✓ |
| 6 | Cancelar o completar | ✓ | ✓ |
| 7 | Perfil + TyC + Privacidad (browser) | ✓ | ✓ |
| 8 | Docs onboarding (solo cond.) | — | ✓ |

Si algo “en local andaba y acá no”: casi siempre API URL, Supabase key, o permiso GPS denegado.

---

## 3) Build AAB production (EAS)

Desde monorepo root, cuenta `gh`/`eas` = **martiyaquinta**.

```bash
export PATH="$HOME/.bun/bin:$PATH:$HOME/.local/bin"
cd /home/marti/Documentos/LIfty/software-lifty
git checkout main && git pull origin main
# o la rama store-ready mergeada

# opcional: empujar secrets otra vez
bun run eas:env:push

# Conductor AAB
cd apps/mobile
bunx eas-cli build -p android --profile production --non-interactive

# Pasajero AAB
cd ../mobile-passengers
bunx eas-cli build -p android --profile production --non-interactive
```

Esperá `FINISHED` + link del **.aab** (no .apk).

Ver:
```bash
eas build:list --platform android --limit 3
```

`autoIncrement` sube versionCode remoto; no pelear con el `versionCode` del app.json si `appVersionSource=remote`.

---

## 4) Crear / completar listing en Play Console

Para **cada** app:

1. Play Console → Create app (si no existe).
2. Dashboard → completar **declaraciones** (política de datos, ads, target audience, content rating).
3. **Store presence** → main store listing:
   - Nombre: Lifty / Lifty Pasajero
   - Short + full description
   - Graphics
4. **App content** → Privacy policy = `https://web.liftyviajes.com/privacidad`
5. Countries / pricing (gratis).
6. **Testing** → Internal testing → create release.

---

## 5) Subir el AAB

### Opción A — manual (más simple la primera vez)
1. Descargá el `.aab` desde la página del build EAS.
2. Play Console → Internal testing → Create release → upload AAB.
3. Release notes (ES): “Primera build interna Lifty…”.
4. Save → Review → Start rollout to internal testing.
5. Agregá testers (email Gmail de la lista internal).

### Opción B — EAS Submit
Requiere JSON de service account con acceso a Play:

```bash
cd apps/mobile
bunx eas-cli submit -p android --profile production --latest

cd ../mobile-passengers
bunx eas-cli submit -p android --profile production --latest
```

`eas.json` submit production apunta a track **`internal`** + `releaseStatus: draft`.

---

## 6) Smoke del track internal (obligatorio)

Instalá desde Play (link de internal test), **no** el APK viejo.

Repetí la tabla de la §2.  
Si falla solo en Play y no en APK preview: compará versionCode, env production, y firma.

---

## 7) Closed / production

Cuando internal esté estable 1–2 días:

1. Promote release → closed testing (opcional) o production.
2. Play puede pedir 14 días de closed testing en cuentas nuevas.
3. No cambies `applicationId` / package después de publicar.

---

## 8) Comandos útiles

```bash
# Health API
curl -sS https://liftybackend-production.up.railway.app/health

# Legal
curl -sS -o /dev/null -w '%{http_code}\n' https://web.liftyviajes.com/privacidad
curl -sS -o /dev/null -w '%{http_code}\n' https://web.liftyviajes.com/terminos

# Quién soy en EAS
bunx eas-cli whoami

# Env names (sin valores)
cd apps/mobile && bunx eas-cli env:list --environment production
cd ../mobile-passengers && bunx eas-cli env:list --environment production

# Builds
cd apps/mobile && bunx eas-cli build:list -p android --limit 5
cd ../mobile-passengers && bunx eas-cli build:list -p android --limit 5
```

Root helpers ya existentes:
- `bun run eas:login`
- `bun run eas:env:push`
- `bun run eas:build:android:preview` (APK only)
- Production AAB: comandos §3 (aún no hay script root production; preferí explícito)

---

## 9) Errores típicos

| Síntoma | Causa | Qué hacer |
|---------|--------|-----------|
| Play rechaza APK | Subiste preview APK | Build `--profile production` (AAB) |
| App “no conecta” | Falta `EXPO_PUBLIC_API_URL` bakeado | Revisar eas.json env + rebuild |
| Login roto | Supabase key ausente en EAS production | `eas env:list` + `eas:env:push` |
| GPS nunca pide permiso | Falta plugin location / usuario negó | app.json plugin + Settings del celu |
| Push no llega | Sin FCM / google-services | Firebase + rebuild (internal puede vivir sin push) |
| `lockfile had changes, frozen` | Bun lock drift | Pin deps (ver #370) + `bun install` + commit lock |
| versionCode conflict | Ya subiste ese código | Dejar `autoIncrement` / bump remoto |
| Cleartext / “insecure traffic” review | `usesCleartextTraffic: true` | Quitar (esta rama lo hace) |

---

## 10) Orden del día (resumen 1 pantalla)

1. Merge PR store-ready a `main`  
2. Smoke APK preview en 2 celus  
3. Play Console: 2 apps + privacy URL + assets mínimos  
4. `eas build -p android --profile production` ×2  
5. Upload AAB → **internal testing**  
6. Smoke desde Play link  
7. Recién después: production / cerrada  

**No** prometas “queda en Railway” el nombre de la app: el nombre va en el AAB.
