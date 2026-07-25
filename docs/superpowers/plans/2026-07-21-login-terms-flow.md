# Login + Terms Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Crear cuenta" and "Iniciar sesion" buttons to WelcomeScreen, wire up RegisterScreen → LoginCredentials → Terms acceptance gate (shown once) → postAuthRouting.

**Architecture:** Five mobile files changed, no backend. WelcomeScreen gains two CTAs. RegisterScreen passes email to LoginCredentials on verify success. LoginCredentials checks `termsAccepted` in authStore before routing — if false, shows TermsScreen. TermsScreen resolves route dynamically instead of hardcoding OnboardingStep1. AuthStore gets persistable `termsAccepted` field.

**Tech Stack:** Expo SDK 56, expo-router (file-based routing), Zustand + AsyncStorage persistence, TypeScript 6.0.

## Global Constraints
- Conventional commits, biome+commitlint pre-commit, typecheck must pass
- Mobile: use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*` from `src/theme/index.ts`
- Named exports only — no default exports
- Use `useAppNavigation()` hook for all screen navigation

---

### Task 1: AuthStore — add `termsAccepted` field

**Files:**
- Modify: `apps/mobile/src/store/authStore.ts`

**Interfaces:**
- Produces: `termsAccepted: boolean` in AuthState, `setTermsAccepted: (accepted: boolean) => void`, persisted in `partialize`, reset in `clearAuth`

- [ ] **Step 1: Add `termsAccepted` to AuthState interface**

Edit `apps/mobile/src/store/authStore.ts`, add after the `kycSessionId` line in the interface:

```ts
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
```

- [ ] **Step 2: Add initial value and setter in `create` call**

In the `persist` callback's `(set) => ({...})`, add after `kycSessionId: null,`:

```ts
      termsAccepted: false,
```

Add after `setKycSessionId:`:

```ts
      setTermsAccepted: (termsAccepted) => set({ termsAccepted }),
```

- [ ] **Step 3: Add `termsAccepted` to `clearAuth` reset**

In `clearAuth`, add after `kycSessionId: null,`:

```ts
          termsAccepted: false,
```

- [ ] **Step 4: Add `termsAccepted` to `partialize`**

In `partialize`, add after `kycSessionId: state.kycSessionId,`:

```ts
        termsAccepted: state.termsAccepted,
```

- [ ] **Step 5: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS (no errors)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/store/authStore.ts
git commit -m "feat: add termsAccepted field to authStore"
```

---

### Task 2: WelcomeScreen — two CTAs

**Files:**
- Modify: `apps/mobile/src/screens/WelcomeScreen.tsx`

**Interfaces:**
- Consumes: `useAppNavigation()` navigate
- Produces: Two buttons navigating to `Register` and `LoginCredentials`

- [ ] **Step 1: Replace "COMENZAR" button with two buttons**

Edit `apps/mobile/src/screens/WelcomeScreen.tsx`. Replace the `<View style={styles.spacer} />` and the `<Button title="COMENZAR" .../>` block with two buttons (the container's `gap: theme.spacing.lg` handles spacing automatically):

```tsx
      <Button
        title="CREAR CUENTA"
        onPress={() => navigation.navigate('Register')}
        style={styles.button}
        textStyle={styles.buttonText}
      />
      <Button
        title="INICIAR SESION"
        variant="secondary"
        onPress={() => navigation.navigate('LoginCredentials')}
        style={styles.secondaryButton}
        textStyle={styles.secondaryButtonText}
      />
```

- [ ] **Step 2: Clean up unused `spacer` style**

Remove the `spacer` entry from `StyleSheet.create`:

```ts
  spacer: {
    height: 24,
  },
```

- [ ] **Step 3: Verify the `secondaryButton` style exists**

The `secondaryButton` style is already defined at line 82-85 in the file:

```ts
  secondaryButton: {
    borderColor: theme.colors.white,
    height: 52,
  },
```

No change needed — it already exists from the old code.

- [ ] **Step 4: Run lint**

```bash
bun run lint
```

Expected: PASS (no errors on WelcomeScreen.tsx)

- [ ] **Step 5: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/WelcomeScreen.tsx
git commit -m "feat: add Crear cuenta and Iniciar sesion buttons to WelcomeScreen"
```

---

### Task 3: RegisterScreen — pass email param to LoginCredentials

**Files:**
- Modify: `apps/mobile/src/screens/RegisterScreen.tsx`

**Interfaces:**
- Consumes: `useAppNavigation()` navigate, `useAuthStore` setDriverStatus
- Produces: After verify success, navigates to LoginCredentials with email param

- [ ] **Step 1: Change navigation after verification**

In `handleVerify`, line 87, change:

```ts
      navigation.replace('LoginCredentials');
```

to:

```ts
      navigation.replace('LoginCredentials', { email: email.trim() });
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/RegisterScreen.tsx
git commit -m "feat: pass email param to LoginCredentials after register verify"
```

---

### Task 4: LoginCredentialsScreen — terms gate + email param

**Files:**
- Modify: `apps/mobile/src/screens/LoginCredentialsScreen.tsx`

**Interfaces:**
- Consumes: `useLocalSearchParams` for email param, `useAuthStore` termsAccepted
- Produces: After login, routes to TermsScreen if terms not accepted, else direct to postAuthRouting

- [ ] **Step 1: Add imports**

At top of file, add `useLocalSearchParams` import from `expo-router` and `useAuthStore` (already imported):

```ts
import { useLocalSearchParams } from 'expo-router';
```

Change the existing React import line to:

```ts
import { useEffect, useState } from 'react';
```

- [ ] **Step 2: Read email param and termsAccepted from store**

After `const login = useLogin();`, add:

```ts
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const termsAccepted = useAuthStore((s) => s.termsAccepted);

  useEffect(() => {
    if (emailParam && !username) {
      setUsername(emailParam);
    }
  }, [emailParam]);
```

- [ ] **Step 3: Add terms gate in handleLogin**

Replace the success section of `handleLogin` (from line 37 to the end of the function) with:

```ts
      const loginResult = await login.mutateAsync({ email: username.trim(), password });

      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = parsed.success ? parsed.data : (payload as DriverStatus);

      const route = routeForDriverStatus(driverData);
      setDriverStatus(route.status);

      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }

      if (termsAccepted) {
        if (route.screen) {
          navigation.navigate(route.screen);
        }
      } else {
        navigation.navigate('Terms');
      }
```

Note: the existing function already has similar logic for API call + routeForDriverStatus. The key change is the `termsAccepted ? direct : Terms` gate.

- [ ] **Step 4: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/LoginCredentialsScreen.tsx
git commit -m "feat: add terms acceptance gate and email param to LoginCredentials"
```

---

### Task 5: TermsScreen — dynamic postAuthRouting

**Files:**
- Modify: `apps/mobile/src/screens/TermsScreen.tsx`

**Interfaces:**
- Consumes: `resolvePostAuthRoute` from `postAuthRouting`, `useAuthStore` setTermsAccepted
- Produces: On accept, sets termsAccepted=true, resolves route, navigates dynamically

- [ ] **Step 1: Add imports**

Add to the existing imports:

```ts
import { resolvePostAuthRoute } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
```

- [ ] **Step 2: Add state and handler**

After `const navigation = useAppNavigation();`, add:

```ts
  const setTermsAccepted = useAuthStore((s) => s.setTermsAccepted);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      setTermsAccepted(true);
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al verificar tu cuenta';
      setError(message);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Update accept button**

Replace the existing `Button` in the footer (lines 55-59) with:

```tsx
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
        <Button
          title={loading ? '' : 'ACEPTAR Y CONTINUAR'}
          onPress={handleAccept}
          loading={loading}
          disabled={loading}
          style={styles.button}
        />
```

- [ ] **Step 4: Add error text style**

In `StyleSheet.create`, add:

```ts
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
```

- [ ] **Step 5: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 6: Run full lint**

```bash
bun run lint
```

Expected: PASS (no errors on TermsScreen.tsx)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/TermsScreen.tsx
git commit -m "feat: dynamic postAuthRouting after terms acceptance"
```

---

### Task 6: Integration verification — full flow typecheck + lint

**Files:**
- (none — verification only)

- [ ] **Step 1: Full typecheck**

```bash
bun run typecheck
```

Expected: PASS (both backend and mobile)

- [ ] **Step 2: Full lint**

```bash
bun run lint
```

Expected: PASS (all files)

- [ ] **Step 3: Manual verification**

Verify the full flow works by running the app:

```bash
bun --filter @lifty/mobile start
```

Test paths:
1. Fresh install → Welcome → "CREAR CUENTA" → RegisterScreen → sign up → verify OTP → LoginCredentials (email pre-filled) → login → TermsScreen → accept → onboarding
2. Welcome → "INICIAR SESION" → LoginCredentials → login → TermsScreen (if first time) → accept → Online/onboarding
3. Second login → Welcome → "INICIAR SESION" → LoginCredentials → login → direct to Online (no Terms)
