# PROMPT — Pantalla de ayuda TVF / Cancelaciones (app conductor)

**Para:** agente ejecutor (fresh context). No heredes historial.
**De:** orquestador del proyecto Lifty
**Idioma:** español (UI y copy en español rioplatense, voseo: "cancelás", "tocá", "te transferimos")
**Repo:** `/home/marti/Documentos/LIfty/software-lifty`
**App:** `apps/mobile` (conductor). NO tocar `apps/mobile-passengers` ni backend.
**Branch:** nunca pushear a `main`. Todo por PR. Conventional Commits.
**No commitees** a menos que el humano lo pida.

---

## Quién sos y qué tenés que hacer

Sos el ejecutor de una feature de **UI educativa** en Perfil del conductor.

Hoy la card **Cancelaciones** de `ProfileScreen` tira números (TVF %, viajes, cancelaciones, no-show, "Se te debe") **sin explicar nada**. El conductor no entiende qué es TVF ni cómo la app trata las cancelaciones.

**Objetivo:** esa card tiene que ser tappable y abrir una pantalla nueva, linda y fácil de leer, que explique TVF + la política de cancelaciones **con las reglas reales del producto**.

No es un rediseño de Perfil. No es un cambio de política. No toques backend, matching, ni el flujo de cancelar un viaje.

---

## Skills que DEBÉS invocar (fresh context)

1. `bmad-quick-dev` — implementación.
2. `verification-before-completion` — antes de afirmar que está listo.
3. Leé y respetá:
   - `AGENTS.md` (root)
   - `apps/mobile/AGENTS.md`
   - `docs/superpowers/specs/2026-08-18-cancellation-policy-design.md` (SSOT de reglas)
   - Este prompt es el contrato de UI. Si el spec y este prompt chocan en **números/reglas**, gana el spec. Si chocan en **copy/layout**, gana este prompt.

---

## Restricciones (no negociables)

- Lifty está en desarrollo activo. No deploy. No CD.
- Theme: **siempre** `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*`, `theme.radius.*`, `theme.dimensions.*`. Nunca hardcodear hex ni tamaños mágicos.
  - `deepBlue` `#0F2A44`, `turquoise` `#1BBFAE`, `white`, `lightGray` `#EDF1F5`, `mediumGray` `#8A93A0`, `dangerRed` `#FF6B6B`, `amber` `#FFB020`, `success` `#34C759`.
- Named exports only. `StyleSheet.create()` al final.
- No `@react-navigation/*`. Rutas via expo-router + `useAppNavigation`.
- No comentarios en código.
- No secretos.
- No cambies copy de `TripCancelledScreen`, `WaitingPassengerScreen`, `IncomingRequestScreen` ni `TermsScreen` (Terms tiene texto viejo de 5 min — fuera de scope).
- No inventes reglas. Copy canónica abajo. Montos `$600`, ventanas `2 min` / `5 min` / `30 días`, umbrales `70%` / `50%`.
- No agregues endpoint nuevo. Reusá `GET /drivers/me/cancellation-metrics` (ya se llama en Perfil).
- Verificar: `bunx tsc --noEmit` en `apps/mobile` + `bun run lint` desde root (o biome sobre archivos tocados).

---

## Estado actual (verificá, no asumas)

Card muerta en `apps/mobile/src/screens/ProfileScreen.tsx` ~L324–364:

```tsx
{metrics ? (
  <Card>
    <Text style={styles.sectionTitle}>Cancelaciones</Text>
    {/* TVF %, viajes/cancels, driver_cancels, no_shows, payouts, deuda */}
  </Card>
) : null}
```

- No hay `onPress`. No hay chevron. No hay ruta.
- Métricas: `GET /api/drivers/me/cancellation-metrics` → `cancellationService.getDriverCancellationMetrics`.
- Payload (ya existe, no lo cambies):

```ts
{
  tvf_rate_pct: number;       // 1 decimal
  tvf_completed: number;
  tvf_cancels: number;        // solo las que cuentan para TVF
  period_days: number;        // 30
  total_cancels: number;
  driver_cancels: number;
  no_shows: number;
  payouts_pending_ars: number;
  payouts_paid_ars: number;
  platform_debt: number;
  debt_cap_ars: number;
  debt_remaining_ars: number;
  commission_active: boolean;
}
```

Routing a tocar:

- `apps/mobile/src/hooks/useAppNavigation.ts` — `SCREEN_TO_ROUTE`
- `apps/mobile/app/_layout.tsx` — `TabBarShell.hiddenRoutes` + `RouteSync`
- Nuevo `apps/mobile/app/<ruta>.tsx` re-exportando la screen
- Nuevo `apps/mobile/src/screens/<Screen>.tsx`

Patrones a copiar:

- Agregar screen: `app/screen-name.tsx` re-export + mapping en `useAppNavigation`.
- Navbar: `apps/mobile/src/components/Navbar.tsx` — `showBack` default true, `onBack={navigation.goBack}`.
- Card / Button / Text existentes. `Button` variants: `primary | secondary | danger | cta | outline`.
- `Card` tiene `width: 343` fijo — en la screen nueva usá Cards a `width: '100%'` overrideando style, o Views con el mismo look. No dejes un scroll de cards angostas flotando.

---

## Qué construir

### 1. Card de Perfil → tappable

En `ProfileScreen`, envolvê la card Cancelaciones en `TouchableOpacity` (o hacé que todo el Card sea el hit target).

Keep el resumen (TVF % + 1 línea). Sacá el resto de filas densas de la card de Perfil — viven en la screen nueva. La card de Perfil queda como teaser, no como ficha técnica.

UI del teaser (obligatorio):

- Título: **Cancelaciones**
- Derecha: chevron `chevron-forward` (`Ionicons`) color `mediumGray`
- Valor grande: `{tvf_rate_pct.toFixed(1)}%` en color según umbral (ver paleta abajo)
- Subtítulo: `TVF · últimos {period_days} días`
- Hint: `Tocá para ver cómo funciona` en `xs` / `mediumGray`
- `accessibilityRole="button"`
- `accessibilityLabel="Cancelaciones. TVF {pct} por ciento. Abrir explicación"`
- `onPress` → `navigation.navigate('CancellationPolicy')` (nombre exacto)

Si `metrics` es null, no muestres la card (igual que hoy).

### 2. Nueva ruta + screen

| Pieza | Valor |
|---|---|
| Screen name | `CancellationPolicy` |
| Ruta | `/cancellation-policy` |
| Archivo route | `apps/mobile/app/cancellation-policy.tsx` |
| Screen | `apps/mobile/src/screens/CancellationPolicyScreen.tsx` |
| Export | `export const CancellationPolicyScreen` |

`useAppNavigation.ts`:

```
CancellationPolicy: '/cancellation-policy',
```

`_layout.tsx`:

- **NO** agregar a `hiddenRoutes` — el tab bar queda visible.
- En `RouteSync`, si `pathname === '/cancellation-policy'` → `setActiveTab('profile')`.

Navbar: título **Cancelaciones**, back a Perfil (`navigation.goBack()`).

ScrollView full width, fondo `lightGray`, padding `theme.spacing.md`, `paddingBottom` = `tabBarHeight + spacing['2xl']`. `showsVerticalScrollIndicator={false}`.

Cargá métricas en esta screen (no dependas de params):

```ts
apiClient.get('/drivers/me/cancellation-metrics')
```

Mismo unwrap que Perfil: `res.data?.data ?? res.data`. Loading: `ActivityIndicator` turquoise. Error: card con "No pudimos cargar tus números" + `Button` outline **REINTENTAR**. El copy educativo (secciones 2–5) se muestra igual si falla el fetch — solo el hero de números queda en estado vacío/error.

### 3. Layout de la screen (UI que se vea bien)

No un wall of text. Cards apiladas, iconos, chips, botones claros. Pensá en un conductor que lee esto en 30 segundos parado en la calle.

**Orden de bloques (fijo):**

1. **Hero TVF** — card blanca
   - Chip pill: `TVF`
   - Número enorme (`theme.fontSize['3xl']` o `'4xl'`) `{pct}%` con color de umbral
   - Una línea: `Tasa de Viajes Finalizados`
   - Fórmula en lenguaje humano, no código:
     > Completaste {tvf_completed} viajes y cancelaste {tvf_cancels} que cuentan. TVF = viajes completados ÷ (completados + esas cancelaciones).
   - Si denominator 0: `Todavía no hay viajes que cuenten. Tu TVF arranca en 100%.`
   - Barra de progreso 0–100 (View track `lightGray` + fill del color de umbral, `height: 8`, `radius.full`).
   - Badge de estado (pill):
     - `≥ 70%` → `En regla` / `success`
     - `≥ 50% y < 70%` → `Cuidado` / `amber`
     - `< 50%` → `En riesgo` / `dangerRed`

2. **¿Qué es el TVF?** — card
   - Título + 3–4 oraciones max (copy canónica abajo).
   - Lista de 2 filas con icono:
     - check `success`: "Pasajero cancela o no se presenta → no te baja el TVF"
     - close `dangerRed`: "Si cancelás vos en camino → sí cuenta"

3. **¿Cuándo te afecta?** — card con 4 filas tappeable-looking (no tienen que navegar; son filas explicativas con icono + título + 1 línea)
   - Usá el copy de "Tabla conductor" abajo. Cada fila: icono Ionicons, título bold `deepBlue`, body `sm` `mediumGray`.

4. **Plata** — card
   - `$600` destacado en `turquoise`
   - Cuándo cobrás / cuándo no (copy canónica).
   - Si `payouts_pending_ars > 0`: banner "Lifty te debe ${n}. Te lo transferimos."
   - Si `commission_active && platform_debt > 0`: fila deuda `${platform_debt} / ${debt_cap_ars}`. Si `debt_remaining_ars === 0`, warning rojo igual que Perfil.

5. **Umbrales** — card con 3 steps verticales (línea + dots)
   - `70% o más` — seguís recibiendo viajes normal
   - `Menos de 70%` — te avisamos. Cuidado.
   - `Menos de 50%` — dejás de recibir ofertas hasta que soporte revise tu cuenta

6. **CTA inferior**
   - `Button` `primary` **ENTENDIDO** → `navigation.goBack()`
   - `Button` `outline` **VER HISTORIAL** → `navigation.navigate('TripHistory')`
   - Gap `theme.spacing.sm`, width 100%.

Paleta de umbral (helper local en el mismo file, no crees utils globales):

```ts
function tvfTone(pct: number) {
  if (pct < 50) return theme.colors.dangerRed;
  if (pct < 70) return theme.colors.amber;
  return theme.colors.success;
}
```

Detalles de pulido (no skippear):

- Todas las cards: `width: '100%'`, `borderRadius: theme.radius.xl`, padding `theme.spacing.md`, gap interno `theme.spacing.sm`.
- Iconos Ionicons 20–22, color `turquoise` salvo estados success/amber/danger.
- No emojis.
- No hardcodees `$600` en 10 lugares sueltos: `const FEE_ARS = 600` arriba del componente.
- Safe area: Navbar ya maneja top inset. Bottom = tab bar + padding.
- Tipografía: títulos `sm` bold `deepBlue`, body `sm` `mediumGray`, números `lg`+ bold.

---

## Copy canónica (pegá esto, no improvises)

Fuente: spec `2026-08-18-cancellation-policy-design.md`. Ventana TVF = 30 días. Fee = $600. Gracia pasajero = 2 min desde `assigned_at`. Espera no-show = 5 min desde `waiting_since`.

### ¿Qué es el TVF?

> El TVF es tu **Tasa de Viajes Finalizados**. Mide cuántos viajes terminás versus cuántos cancelás vos.
>
> Solo bajan el TVF las cancelaciones que **hiciste vos** cuando ya habías aceptado y ibas en camino.
>
> No baja el TVF si el pasajero cancela, si no aparece después de 5 minutos, o si se corta la búsqueda.

### Fórmula (para el hero, no mostrar como código)

`TVF = completados / (completados + cancelaciones tuyas que cuentan)` en los últimos 30 días.
Si no hay ninguno de los dos, se muestra 100%.

### Tabla conductor — "¿Cuándo te afecta?"

| Título | Body |
|---|---|
| Vas en camino | Si cancelás, no hay multa, pero **sí cuenta para el TVF**. |
| Llegaste y esperás | Los primeros 5 minutos no podés cancelar. Después podés marcar **no-show**. Cobrás $600 y **no te baja el TVF**. |
| El pasajero cancela | Si ya pasaron 2 minutos desde que aceptaste, o si ya llegaste, cobrás $600. **No te baja el TVF**. |
| Viaje en curso | Nadie puede cancelar. |

### Plata

> Cuando el pasajero cancela tarde o no se presenta, te corresponde **$600**.
> Lifty te los transfiere. Aparecen en esta pantalla como "Se te debe" hasta que se paguen.
> Si cancelás vos en camino, no hay multa ni cobro. Solo impacta el TVF.

### Umbrales (texto de los 3 steps)

1. **70% o más** — Tu cuenta está en regla. Recibís viajes con normalidad.
2. **Menos de 70%** — Te mandamos un aviso. Si sigue bajando, tu cuenta puede ir a revisión.
3. **Menos de 50%** — Dejás de recibir ofertas hasta que soporte revise tu cuenta.

### Qué NO decir

- No digas "tasa de finalización" a secas — el nombre del producto es **TVF**.
- No uses la política vieja (5 min cancelled_early/late, TVF a 7 días).
- No expliques deuda del pasajero ($2500/$3000) ni % de cancelación del pasajero. Eso no es de esta pantalla.
- No menciones MercadoPago, phase 2, ni admin.
- `platform_debt` del conductor (tope de efectivo cuando hay comisión) **sí** se puede mostrar en la card Plata si `commission_active`, con el mismo wording de Perfil: `Alcanzaste el tope. Regularizá tu saldo o cobrá por transferencia.` No lo mezcles con TVF.

---

## Fuera de scope

- Backend, migraciones, config keys.
- App pasajero.
- Cambiar `evaluateCancel`, fees, o umbrales.
- Actualizar TermsScreen (texto viejo).
- Modal en vez de screen. Tiene que ser **otra pantalla**.
- Deep link / push hacia esta screen (nice-to-have, no lo hagas).
- Tests E2E. Si hay tests Jest de navigation en mobile, no rompas tipos.

---

## Definition of done

1. En Perfil, la card Cancelaciones se ve tappable (chevron + hint) y navega a `/cancellation-policy`.
2. La screen nueva explica TVF + las 4 situaciones + $600 + umbrales 70/50 con el copy de arriba.
3. El hero usa las métricas reales del endpoint existente.
4. Back y **ENTENDIDO** vuelven a Perfil. **VER HISTORIAL** abre TripHistory.
5. Tab bar visible, tab Perfil activo.
6. UI usa theme tokens, Cards, Buttons, iconos. Se ve prolija en un teléfono 375 de ancho.
7. `bunx tsc --noEmit` en `apps/mobile` pasa. Lint de archivos tocados pasa.
8. No hay cambios de backend ni de la app pasajero.

---

## Cómo arrancar

1. Leé los archivos listados en "Estado actual".
2. Implementá ruta + mapping + screen + teaser.
3. Corré typecheck + lint.
4. Parate. No commitees.
5. En el mensaje final, listá archivos tocados y cómo probarlo en Expo (Perfil → toca Cancelaciones).
