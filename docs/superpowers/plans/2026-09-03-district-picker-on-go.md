# District Picker on GO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an approved driver taps GO without a municipality, show a Lifty-styled in-place sheet (list + TyC), assign the district, and auto-retry connect so they go online without a dead-end error.

**Architecture:** Client-only UX change. Reuse existing districts APIs. Post-auth routes approved drivers straight to Active. `ActiveScreen.connect` opens `DistrictPickerSheet` on missing district / `DISTRICT_REQUIRED`, then retries the same connect path after `PUT /drivers/me/district`. Backend contracts unchanged.

**Tech Stack:** Expo SDK 54 + React 19 + TypeScript (driver app), existing Elysia districts endpoints, Jest for mobile unit tests, Bun test for backend (no backend code changes expected).

**Spec:** `docs/superpowers/specs/2026-09-03-district-picker-on-go-design.md`

## Global Constraints

- Mobile theme only via `theme.*` from `apps/mobile/src/theme/index.ts` (deepBlue `#0F2A44`, turquoise `#1BBFAE`, Nunito)
- Named exports only for components/screens; no default exports in `src/`
- `ApiError` from `apps/mobile/src/api/types.ts` for error codes (`err.code === 'DISTRICT_REQUIRED'`)
- District assignment remains permanent server-side (`409 DISTRICT_ALREADY_SET`)
- Do not delete full-screen SelectProvince / SelectDistrict / DistrictTerms routes in this plan
- Do not change matching-by-district (out of scope)
- No backend schema/API changes for MVP
- Commits: Conventional Commits, GPG signed (`git commit -S`) when the environment supports it
- Test mobile with Jest: `cd apps/mobile && bun run test -- <path>`
- Do not use `bun test` directly on mobile RN files (use package `test` script / Jest)

## File map

| File | Responsibility |
|------|----------------|
| `apps/mobile/src/lib/postAuthRouting.ts` | Approved → Active even without district |
| `apps/mobile/src/__tests__/lib/postAuthRouting.test.ts` | Routing cases including no-district → Active |
| `apps/mobile/src/lib/connectBlockedFeedback.ts` | Map `DISTRICT_REQUIRED` for fallback only (sheet is primary) |
| `apps/mobile/src/__tests__/lib/connectBlockedFeedback.test.ts` | DISTRICT_REQUIRED mapping |
| `apps/mobile/src/components/DistrictPickerSheet.tsx` | Modal sheet: list → TyC → assign |
| `apps/mobile/src/lib/stripHtml.ts` | Shared stripHtml helper (extracted from DistrictTermsScreen) |
| `apps/mobile/src/screens/DistrictTermsScreen.tsx` | Import shared stripHtml (optional cleanup) |
| `apps/mobile/src/screens/ActiveScreen.tsx` | Wire sheet into connect + auto-retry |
| `apps/mobile/src/__tests__/lib/shouldOpenDistrictPicker.test.ts` | Pure helper for when to open sheet |

---

### Task 1: Post-auth routing — approved without district → Active

**Files:**
- Modify: `apps/mobile/src/lib/postAuthRouting.ts`
- Modify: `apps/mobile/src/__tests__/lib/postAuthRouting.test.ts`

**Interfaces:**
- Consumes: `DriverStatus` (`has_district?: boolean`)
- Produces: `routeForDriverStatus` never returns `SelectProvince` for approved drivers

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/src/__tests__/lib/postAuthRouting.test.ts`, add/replace cases:

```typescript
  it('routes approved drivers with district to Active home', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      step: 'approved',
      has_district: true,
    });
    expect(r.screen).toBe('Active');
  });

  it('routes approved drivers without district to Active (picker on GO)', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      step: 'approved',
      has_district: false,
    });
    expect(r.screen).toBe('Active');
    expect(r.screen).not.toBe('SelectProvince');
  });

  it('routes approved status without step and without district to Active', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      has_district: false,
    });
    expect(r.screen).toBe('Active');
  });
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd apps/mobile && bun run test -- src/__tests__/lib/postAuthRouting.test.ts
```

Expected: FAIL on without-district cases still routing to `SelectProvince`.

- [ ] **Step 3: Implement routing change**

In `apps/mobile/src/lib/postAuthRouting.ts`, change `routeForDriverStatus` so district no longer gates routing:

```typescript
export function routeForDriverStatus(driverData: DriverStatus): {
  screen: ScreenName | '';
  status: DriverStatusValue;
  blockedMessage?: string;
} {
  const { status, step } = driverData;

  if (status === 'rejected') {
    return {
      screen: '',
      status,
      blockedMessage: 'Tu cuenta ha sido rechazada. Contacta a soporte.',
    };
  }
  if (status === 'suspended') {
    return { screen: '', status, blockedMessage: 'Tu cuenta ha sido suspendida.' };
  }

  const byStep = step ? STEP_ROUTE[step] : undefined;
  if (byStep) {
    return { screen: byStep.screen, status: byStep.storeStatus };
  }

  if (status === 'approved') {
    return { screen: 'Active', status: 'approved' };
  }
  if (status === 'under_review') return { screen: 'Active', status: 'under_review' };

  return { screen: 'OnboardingStep1', status: 'pending' };
}
```

Remove all `has_district` / `SelectProvince` branches from this function.

- [ ] **Step 4: Run tests to verify pass**

```bash
cd apps/mobile && bun run test -- src/__tests__/lib/postAuthRouting.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/postAuthRouting.ts apps/mobile/src/__tests__/lib/postAuthRouting.test.ts
git commit -m "fix(mobile): route approved drivers to Active without district gate"
```

---

### Task 2: Helper — when to open district picker + DISTRICT_REQUIRED feedback fallback

**Files:**
- Create: `apps/mobile/src/lib/shouldOpenDistrictPicker.ts`
- Create: `apps/mobile/src/__tests__/lib/shouldOpenDistrictPicker.test.ts`
- Modify: `apps/mobile/src/lib/connectBlockedFeedback.ts`
- Modify: `apps/mobile/src/__tests__/lib/connectBlockedFeedback.test.ts`

**Interfaces:**
- Produces:
  - `shouldOpenDistrictPicker(args: { hasDistrict: boolean | undefined; error?: unknown }): boolean`
  - `isDistrictRequiredError(err: unknown): boolean`
  - `feedbackFromConnectError` maps `DISTRICT_REQUIRED` to a short fallback (sheet is primary UX)

- [ ] **Step 1: Write failing tests for helper**

Create `apps/mobile/src/__tests__/lib/shouldOpenDistrictPicker.test.ts`:

```typescript
import { ApiError } from '../../api/types';
import {
  isDistrictRequiredError,
  shouldOpenDistrictPicker,
} from '../../lib/shouldOpenDistrictPicker';

describe('shouldOpenDistrictPicker', () => {
  it('opens when hasDistrict is false', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: false })).toBe(true);
  });

  it('opens when hasDistrict is undefined (unknown)', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: undefined })).toBe(false);
  });

  it('does not open when hasDistrict is true', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: true })).toBe(false);
  });

  it('opens on DISTRICT_REQUIRED even if hasDistrict was true (stale)', () => {
    const err = new ApiError({
      error: {
        code: 'DISTRICT_REQUIRED',
        message: 'Debes seleccionar un municipio antes de conectarte.',
        status: 400,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    expect(shouldOpenDistrictPicker({ hasDistrict: true, error: err })).toBe(true);
    expect(isDistrictRequiredError(err)).toBe(true);
  });
});
```

Note: `hasDistrict === undefined` → **false** so we do not open the sheet before status loads; only open on explicit `false` or API `DISTRICT_REQUIRED`.

- [ ] **Step 2: Run helper tests — expect fail**

```bash
cd apps/mobile && bun run test -- src/__tests__/lib/shouldOpenDistrictPicker.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement helper**

Create `apps/mobile/src/lib/shouldOpenDistrictPicker.ts`:

```typescript
import { ApiError } from '../api/types';

export function isDistrictRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'DISTRICT_REQUIRED';
}

export function shouldOpenDistrictPicker(args: {
  hasDistrict: boolean | undefined;
  error?: unknown;
}): boolean {
  if (args.error != null && isDistrictRequiredError(args.error)) return true;
  return args.hasDistrict === false;
}
```

- [ ] **Step 4: Add DISTRICT_REQUIRED to connectBlockedFeedback + test**

In `apps/mobile/src/lib/connectBlockedFeedback.ts`, add to `BY_CODE`:

```typescript
  DISTRICT_REQUIRED: {
    title: 'Elegí tu municipio',
    message: 'Seleccioná en qué municipio vas a trabajar para conectarte.',
    tone: 'warning',
  },
```

In `apps/mobile/src/__tests__/lib/connectBlockedFeedback.test.ts` add:

```typescript
  it('maps DISTRICT_REQUIRED as warning fallback', () => {
    const err = new ApiError({
      error: {
        code: 'DISTRICT_REQUIRED',
        message: 'Debes seleccionar un municipio antes de conectarte.',
        status: 400,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    const feedback = feedbackFromConnectError(err);
    expect(feedback.title).toBe('Elegí tu municipio');
    expect(feedback.tone).toBe('warning');
  });
```

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && bun run test -- src/__tests__/lib/shouldOpenDistrictPicker.test.ts src/__tests__/lib/connectBlockedFeedback.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/shouldOpenDistrictPicker.ts \
  apps/mobile/src/__tests__/lib/shouldOpenDistrictPicker.test.ts \
  apps/mobile/src/lib/connectBlockedFeedback.ts \
  apps/mobile/src/__tests__/lib/connectBlockedFeedback.test.ts
git commit -m "feat(mobile): add district picker open helper and DISTRICT_REQUIRED feedback"
```

---

### Task 3: Shared `stripHtml` + `DistrictPickerSheet` component

**Files:**
- Create: `apps/mobile/src/lib/stripHtml.ts`
- Create: `apps/mobile/src/components/DistrictPickerSheet.tsx`
- Modify: `apps/mobile/src/screens/DistrictTermsScreen.tsx` (use shared stripHtml)

**Interfaces:**
- Consumes: `apiClient`, `District` / detail payloads, `Button`, `Text`, `theme`, `ApiError`
- Produces:
```typescript
export type DistrictPickerSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  /** Called after successful PUT /drivers/me/district (including 409 already set). */
  onAssigned: () => void;
};
```

- [ ] **Step 1: Extract stripHtml**

Create `apps/mobile/src/lib/stripHtml.ts`:

```typescript
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
```

In `DistrictTermsScreen.tsx`, remove local `stripHtml` and import from `../lib/stripHtml`.

- [ ] **Step 2: Implement DistrictPickerSheet**

Create `apps/mobile/src/components/DistrictPickerSheet.tsx` with this behavior:

1. `Modal` transparent + fade, backdrop `rgba(15, 42, 68, 0.55)` (same idea as `PayoutMethodGateModal`).
2. Card/sheet: white, `borderRadius: theme.radius.lg`, max height ~80% screen, safe padding.
3. Steps state: `'list' | 'terms'`.
4. On `visible === true`: reset to list, fetch `GET /districts` (no province filter — all selectable).
5. List UI:
   - Title: `Elegí tu municipio`
   - Subtitle: `Vas a trabajar solo en esa zona. La elección no se puede cambiar.`
   - Loading: `ActivityIndicator` turquoise
   - Error: message + `Reintentar`
   - Empty: `No hay municipios disponibles. Contactá a soporte.`
   - Rows: `TouchableOpacity` with `name` (lg deepBlue) + `province` (sm mediumGray), background `lightGray`, `radius.md`
6. On row press: set selected district, step=`terms`, fetch `GET /districts/${id}`.
7. Terms UI:
   - Header with back (sets step to `list`, clears detail error)
   - Title = district name
   - ScrollView: TyC + privacy sections (reuse copy structure from `DistrictTermsScreen`)
   - Footer `Button` title `ACEPTAR Y CONTINUAR` variant `cta` or `primary`, `loading`/`disabled` while submitting
8. Accept:
   - `PUT /drivers/me/district` `{ district_id }`
   - Success → `onAssigned()`
   - `ApiError` with code `DISTRICT_ALREADY_SET` → treat as success → `onAssigned()`
   - Other errors → in-sheet error text under button
9. Close control (X or “Ahora no”) calls `onDismiss` only when not submitting.
10. Named export `DistrictPickerSheet`.

Skeleton structure:

```tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { ApiError } from '../api/types';
import type { District } from '../api/types';
import { theme } from '../theme';
import { stripHtml } from '../lib/stripHtml';
import { Button } from './Button';
import { Text } from './ui/Text';

export type DistrictPickerSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onAssigned: () => void;
};

export const DistrictPickerSheet: React.FC<DistrictPickerSheetProps> = ({
  visible,
  onDismiss,
  onAssigned,
}) => {
  // state: step, districts, loadingList, listError, selected, terms, privacy,
  // loadingDetail, detailError, submitting, submitError
  // effects + handlers as described above
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onDismiss}>
      {/* backdrop + card */}
    </Modal>
  );
};
```

Parse list response like SelectDistrictScreen:

```typescript
const { data: body } = await apiClient.get('/districts');
const payload = body?.data ?? body;
setDistricts(payload.districts ?? []);
```

Detail:

```typescript
const { data: body } = await apiClient.get(`/districts/${id}`);
const payload = body?.data ?? body;
setTerms(payload.terms_and_conditions ?? null);
setPrivacy(payload.privacy_policy ?? null);
```

- [ ] **Step 3: Typecheck mobile**

```bash
cd apps/mobile && bunx tsc --noEmit
```

Expected: no errors from new files.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/stripHtml.ts \
  apps/mobile/src/components/DistrictPickerSheet.tsx \
  apps/mobile/src/screens/DistrictTermsScreen.tsx
git commit -m "feat(mobile): add DistrictPickerSheet for in-place municipality + TyC"
```

---

### Task 4: Wire DistrictPickerSheet into ActiveScreen connect + auto-retry

**Files:**
- Modify: `apps/mobile/src/screens/ActiveScreen.tsx`

**Interfaces:**
- Consumes: `DistrictPickerSheet`, `shouldOpenDistrictPicker`, `driverStatus?.has_district`, existing `connect` / `ApiError`
- Produces: GO without district opens sheet; after assign, connect retries and can go online

- [ ] **Step 1: Imports and state**

At top of `ActiveScreen.tsx` add:

```typescript
import { DistrictPickerSheet } from '../components/DistrictPickerSheet';
import { ApiError } from '../api/types';
import {
  isDistrictRequiredError,
  shouldOpenDistrictPicker,
} from '../lib/shouldOpenDistrictPicker';
```

(`ApiError` may already be reachable via types; import if not.)

State near other useState:

```typescript
const [districtSheetVisible, setDistrictSheetVisible] = useState(false);
```

Derived:

```typescript
const hasDistrict = driverStatus?.has_district;
```

Also grab `queryClient` if needed to invalidate status after assign — prefer:

```typescript
import { useQueryClient } from '@tanstack/react-query';
// ...
const queryClient = useQueryClient();
```

- [ ] **Step 2: Refactor connect to support district gate + retry**

Replace the body of `connect` so that:

1. Existing early returns (awaitingApproval, needsPayoutMethod, documentsPendingReview, !hasLocation) stay first.
2. **Before** calling online API, if `shouldOpenDistrictPicker({ hasDistrict })` → `setDistrictSheetVisible(true); return;`
3. On catch of online API: if `isDistrictRequiredError(err)` → `setDistrictSheetVisible(true); return;` (do **not** `showConnectFeedback` for that code).
4. Other errors still `showConnectFeedback(feedbackFromConnectError(err))`.

Illustrative structure:

```typescript
  const connect = useCallback(async () => {
    setToggleError(null);
    setConnectFeedback(null);

    if (awaitingApproval) {
      showConnectFeedback(feedbackForConnectBlock('not_approved'));
      return;
    }
    if (needsPayoutMethod) {
      setToggleError('Necesitamos tu medio de cobro (CBU/CVU + alias) antes de conectarte.');
      return;
    }
    if (documentsPendingReview) {
      showConnectFeedback(feedbackForConnectBlock('docs_pending'));
      return;
    }
    if (!hasLocation) {
      showConnectFeedback(feedbackForConnectBlock('no_location'));
      return;
    }

    if (shouldOpenDistrictPicker({ hasDistrict })) {
      setDistrictSheetVisible(true);
      return;
    }

    setConnecting(true);
    try {
      await apiClient.put('/drivers/me/online', { is_online: true });
      // existing heartbeat + setOnline block unchanged
      const { lat, lng, heading } = useLocationStore.getState();
      if (lat != null && lng != null) {
        await apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
      }
      const now = Date.now();
      setOnlineSince(now);
      useOnlineStore.setState({ isOnline: true });
      AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
      setOnline(true);
    } catch (err: unknown) {
      if (isDistrictRequiredError(err)) {
        setDistrictSheetVisible(true);
        return;
      }
      showConnectFeedback(feedbackFromConnectError(err));
    } finally {
      setConnecting(false);
    }
  }, [
    awaitingApproval,
    documentsPendingReview,
    hasLocation,
    needsPayoutMethod,
    hasDistrict,
    setOnline,
    setOnlineSince,
    showConnectFeedback,
    feedbackForConnectBlock,
    feedbackFromConnectError,
  ]);
```

- [ ] **Step 3: onAssigned handler**

```typescript
  const handleDistrictAssigned = useCallback(async () => {
    setDistrictSheetVisible(false);
    await queryClient.invalidateQueries({ queryKey: ['driverStatus'] });
    await connect();
  }, [connect, queryClient]);
```

Render near `PayoutMethodGateModal`:

```tsx
      <DistrictPickerSheet
        visible={districtSheetVisible}
        onDismiss={() => setDistrictSheetVisible(false)}
        onAssigned={() => {
          void handleDistrictAssigned();
        }}
      />
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/ActiveScreen.tsx
git commit -m "feat(mobile): open district picker on GO and auto-retry connect"
```

---

### Task 5: Manual verification checklist + routing/regression tests green

**Files:**
- Test only (no new product files unless fixes)

- [ ] **Step 1: Run mobile unit suites touched**

```bash
cd apps/mobile && bun run test -- \
  src/__tests__/lib/postAuthRouting.test.ts \
  src/__tests__/lib/shouldOpenDistrictPicker.test.ts \
  src/__tests__/lib/connectBlockedFeedback.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual QA (dev)**

With backend + driver app running (`bun run dev` or `dev:driver` + `dev:backend`):

1. Use/create approved driver with `district_id` NULL (SQL or never completed district flow).
2. Cold start / login → lands on **Active** map (not SelectProvince).
3. Tap **GO** (with GPS + payout + docs OK) → **DistrictPickerSheet** opens (not red error snackbar about municipio).
4. Pick a municipality that has TyC (e.g. Villa Dolores) → see terms → **Aceptar y continuar**.
5. Sheet closes → driver becomes **online** without second GO tap.
6. Disconnect; GO again → no sheet (already has district).
7. Dismiss sheet without accepting → stays offline; GO opens sheet again.

- [ ] **Step 3: Fix any bugs found; commit if needed**

```bash
git commit -m "fix(mobile): polish district picker on GO edge cases"
```

- [ ] **Step 4: Final commit if only docs/status left**

Ensure working tree for feature files is clean aside from unrelated local files.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Approved without district → Active | Task 1 |
| GO opens sheet instead of dead-end error | Task 2 + 4 |
| List from GET /districts | Task 3 |
| TyC in same overlay | Task 3 |
| PUT district then auto-retry GO | Task 4 |
| Permanent assignment / 409 as success | Task 3 |
| Empty list / load errors in-sheet | Task 3 |
| DISTRICT_REQUIRED stale client | Task 2 + 4 |
| Keep full-screen screens | No delete tasks |
| No backend changes | No backend tasks |
| Theme Lifty tokens | Task 3 |
| Tests routing + helper | Tasks 1–2, 5 |

## Placeholder / consistency check

- No TBD steps.
- `hasDistrict === undefined` does **not** open sheet (wait for status or rely on API error) — explicit in Task 2.
- `onAssigned` always invalidates `driverStatus` then `connect()`.
- Component name `DistrictPickerSheet` consistent across tasks.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-03-district-picker-on-go.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — same session with executing-plans and checkpoints  

Which approach?
