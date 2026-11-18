# fix(mobile): Paso1 checkbox TyC opens Terms (no dead label)

Repo: `/home/marti/Documentos/LIfty/software-lifty`  
App: **`apps/mobile` only** (conductor)  
Base: `origin/main` tip **`7b00f997`** (#556 accuracy) — al arrancar: `git fetch origin main && git rev-parse origin/main`  
Branch: `fix/driver-onboarding-step1-terms-link`  
ClickUp: https://app.clickup.com/t/1dfc7p9x9kg  
Author/gh: `martiyaquinta` (`gh auth switch --user martiyaquinta` antes de push/PR)

## Pack lock (1:1:1)

| CU | Scope | Este PR |
|----|--------|---------|
| **`1dfc7p9x9kg` (este)** | Paso1 label “términos y condiciones” → abrir TyC | **sí** |
| `1dfc7p9x9ew` | Quitar framing **borrador** de copy/version dual-app | **NO** — otro PR |
| Pack 3 meters pin `1dfc7p9x8fu` | metros al pin complete | **NO** |

## Síntoma (Martina / QA)

Flujo registro conductor:

1. Mail + contraseña → pantalla **Términos y condiciones** (accept full).
2. Luego onboarding **Perfil** (`OnboardingStep1Screen`).
3. Abajo: checkbox **“Acepto los términos y condiciones”**.
4. Actual: el texto **no abre ningún link** ni navega a Terms — solo toggle del check al tocar la fila.
5. Esperado: el usuario puede **leer** los TyC desde ese label (in-app Terms y/o link completo), no un label muerto.

Dual-OS. **HARD STOP EAS** — Expo Go / Metro only.

## Root cause (CONFIRMADO tip `7b00f997`)

```tsx
// OnboardingStep1Screen.tsx ~1017–1026
<TouchableOpacity
  style={styles.checkboxRow}
  onPress={() => setTermsAccepted(!termsAccepted)}
  ...
>
  <View style={[styles.checkbox, ...]}>{...}</View>
  <Text style={styles.checkboxLabel}>Acepto los términos y condiciones</Text>
</TouchableOpacity>
```

- `termsAccepted` acá es **state local** del form (gate de Continuar), distinto del store post-`/terms` accept (también se llama `termsAccepted` en authStore).
- Label = `Text` plano — **sin** `onPress` nested, **sin** `navigate('Terms')`, **sin** `Linking.openURL(TERMS_URL)`.
- SoT **pasajero** ya lo hace bien en `RegisterScreen.tsx`:

```tsx
Acepto{' '}
<Text style={styles.termsLink} onPress={() => navigate('Terms')}>
  los términos y condiciones
</Text>
```

- `TermsScreen` conductor ya tiene resumen + links a `TERMS_URL` / `PRIVACY_POLICY_URL` (`legalUrls.ts` → `https://web.liftyviajes.com/terminos|privacidad`).
- `isTermsReadMode({ from, termsAccepted })`: `from === 'profile'` **o** store `termsAccepted` → VOLVER (no re-aceptar). Tras el paso 1 del flujo, store suele ser `true` → open Terms = read mode. Si lab skipea `/terms` y llega a Paso1 con store false, open sin `from` puede mostrar ACEPTAR — OK; preferí **`from: 'profile'`** o documentar `from: 'onboarding'` **solo si** extendés `termsReadMode` para forzar read (evitar replace loop). **KISS preferido:** nested link `navigate('Terms', { from: 'profile' })` = read garantizado sin tocar helper.

## Scope

**IN**

1. `OnboardingStep1Screen.tsx` — checkbox row:
   - Checkbox box sigue toggleando `setTermsAccepted`.
   - Label: “Acepto ” + link tappable **“los términos y condiciones”** (underline / `theme.colors.turquoise` o token link existente — mirror pax `termsLink`).
   - Link: `navigation.navigate('Terms', { from: 'profile' })` **o** mismo patrón pax `navigate('Terms')` si store ya accepted → read mode. Prefer **from: 'profile'** para no disparar `setTermsAccepted(true)` + `replace` del accept path.
   - **No** hacer que el press del link también toggle el check (stopPropagation pattern RN: nested `Text` `onPress` en RN funciona sin toggle si el row no envuelve el link en el mismo handler — SoT pax: row toggles checkbox only on checkbox press; link separate). Ideal: structure like pax `termsRow` (checkbox TouchableOpacity + Text with nested link).
2. Optional smoke-friendly: ensure `useAppNavigation` maps `Terms` (already does for auth flow).
3. Test mínimo si hay harness Step1; si no, document smoke. No flaky device CI.

**OUT**

- CU `1dfc7p9x9ew` quitar “borrador” / bump `GENERAL_TERMS_VERSION`
- Reescribir `TermsScreen` / `generalTermsSummary`
- Auth accept flow / `AuthRedirectWatcher` / dual-role Google TyC skip
- Passenger Register (ya OK) salvo copiar estilo
- District terms / municipio annex
- EAS, `git add -A`, secrets, pack GPS

## DESIGN LOCK

- No rediseñar Paso1 chrome / OnboardingCard / foto / domicilio.
- CTA **Continuar** intacto.
- Checkbox ✓ pattern (#429) se mantiene.
- Theme tokens only.
- Copy label base: “Acepto los términos y condiciones” (link en la frase de TyC).

## Archivos clave

| Path | Por qué |
|------|---------|
| `apps/mobile/src/screens/OnboardingStep1Screen.tsx` | checkbox dead label |
| `apps/mobile-passengers/src/screens/RegisterScreen.tsx` | SoT link pattern (leer, no editar salvo copy spirit) |
| `apps/mobile/src/screens/TermsScreen.tsx` | destino read/accept |
| `apps/mobile/src/lib/termsReadMode.ts` | read mode rules |
| `apps/mobile/src/legal/legalUrls.ts` | TERMS_URL (si preferís Linking directo — **prefer in-app Terms**) |
| `apps/mobile/src/hooks/useAppNavigation.ts` | Terms route map |

## Sketch

```tsx
// Prefer structure like pax RegisterScreen
<View style={styles.checkboxRow}>
  <TouchableOpacity
    onPress={() => setTermsAccepted(!termsAccepted)}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: termsAccepted }}
    ...
  >
    <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
      {termsAccepted ? <Text style={styles.checkmark}>✓</Text> : null}
    </View>
  </TouchableOpacity>
  <Text style={styles.checkboxLabel}>
    Acepto{' '}
    <Text
      style={styles.termsLink}
      onPress={() => navigation.navigate('Terms', { from: 'profile' })}
      accessibilityRole="link"
    >
      los términos y condiciones
    </Text>
  </Text>
</View>
```

`termsLink`: color primary/turquoise + underline; hit target OK.

## Criterios de aceptación

- [ ] En Paso1, tap en **“los términos y condiciones”** abre `TermsScreen` (resumen in-app).
- [ ] Desde ese open, usuario puede volver a Paso1 **sin** perder el form (goBack; no wipe).
- [ ] Terms abierto desde el link está en **read mode** (VOLVER, no force re-accept replace) cuando aplica `from=profile` / store accepted.
- [ ] Checkbox sigue siendo requerido para Continuar; tap solo en el box (o zona check) togglea.
- [ ] Tap en el link **no** falla silencioso.
- [ ] Dual-OS Expo Go; HARD STOP EAS.
- [ ] 1 issue = 1 branch = 1 PR; no mezclar `1dfc7p9x9ew`.

## Verify

```bash
cd /home/marti/Documentos/LIfty/software-lifty
export PATH="$HOME/.bun/bin:$PATH"
git fetch origin main
git checkout -B fix/driver-onboarding-step1-terms-link origin/main
# … implement …
bun --filter @lifty/mobile exec tsc --noEmit
# tests scoped if any OnboardingStep1 / terms
bun --filter @lifty/mobile test -- --testPathPattern='termsReadMode|OnboardingStep1' 2>/dev/null || true
```

Smoke Expo Go conductor:

1. Registro / o cuenta en Paso1.
2. Tap link TyC del checkbox → Terms visible.
3. VOLVER → sigue en Paso1 con campos.
4. Check + Continuar sigue validando términos locales.

## Entrega

1. Conventional commit, subject-case lowercase:  
   `fix(mobile): open terms from onboarding step1 checkbox label`
2. **No** `git add -A` — solo archivos del fix (+ este handoff si ya en la branch).
3. PR a `main`: summary + root cause 3–5 líneas + test plan + ClickUp URL.
4. Post-create: `gh pr comment <N> --body '/review'`
5. Comment ClickUp con PR URL + branch.
6. **Complete CU solo post-merge** (+ SHA). No complete pre-merge.
7. No secrets, no EAS, no drive-by legal copy borrador.

## Anti-scope siblings

- `1dfc7p9x9ew` TyC sin borrador Expo Dev
- `1dfc7p9x8fu` meters-to-pin pack 3
- GPS complete #555/#556 STALE
- Driver Paso1 back-to-welcome / keyboard / maps auth residuals
