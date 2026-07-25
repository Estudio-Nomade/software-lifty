# Turn-by-turn Navigation Instructions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show turn-by-turn navigation instructions ("En 300m, girar a la derecha en Av. Corrientes") in NavigationScreen and TripInProgressScreen, updated in real-time based on GPS position.

**Architecture:** Backend exposes OSRM steps (already fetched internally) via `GET /maps/directions`. Mobile decodes step geometry endpoints, matches against GPS position via proximity (<20m), and displays the current instruction in the bottom card. Shared `useManeuverInstructions` hook serves both screens.

**Tech Stack:** Bun + Elysia (backend), Expo SDK 56 + React 19 (mobile), OSRM routing engine, Zustand for GPS state

## Global Constraints

- Branch: `feat/issue-139-turn-by-turn-navigation`
- Commit convention: `feat:`, `test:`, `refactor:` (conventional commits)
- Backend tests run with `bun test` in `apps/backend`
- Mobile typecheck: `bun --filter @lifty/mobile exec tsc --noEmit`
- Mobile tests: `bun --filter @lifty/mobile test` (jest-expo)
- Mobile theme: always import from `src/theme/index.ts`, use `theme.colors.*`
- Mobile routing: expo-router via `useAppNavigation()` hook
- No emojis in code unless existing pattern uses them
- Steps with distance <50m are filtered out
- Proximity threshold for step advance: 20m

---

### Task 1: Backend — Expose ManeuverStep type and return steps in directions

**Files:**
- Modify: `apps/backend/src/shared/lib/geo.ts`

**Interfaces:**
- Produces: `ManeuverStep` interface, `DirectionsResult.steps: ManeuverStep[]`
- Produces: OSRM steps filtered (distance >= 50m) and mapped to ManeuverStep in response

- [ ] **Step 1: Add ManeuverStep interface and extend DirectionsResult**

In `apps/backend/src/shared/lib/geo.ts`, after the `DirectionsResult` interface (line 25), add:

```ts
export interface ManeuverStep {
  maneuver_type: string;
  maneuver_modifier?: string;
  name: string;
  distance: number;
  geometry: string;
}
```

- [ ] **Step 2: Extend OSRMStep with geometry field**

Modify the `OSRMStep` interface (line 32-40) to include `geometry`:

```ts
interface OSRMStep {
  name: string;
  distance: number;
  duration: number;
  geometry: string;
  maneuver: {
    type: string;
    modifier?: string;
  };
}
```

- [ ] **Step 3: Add steps to DirectionsResult interface**

Change `DirectionsResult` (line 21-25) to:

```ts
export interface DirectionsResult {
  distance_km: number;
  duration_minutes: number;
  polyline: string;
  steps: ManeuverStep[];
}
```

- [ ] **Step 4: Extract and filter steps in directions() function**

In the `directions()` function, after selecting `bestRoute` (after line 249), add step extraction and filtering. The current code at lines 250-256:

```ts
    const distance_km = Math.round((bestRoute.distance / 1000) * 100) / 100;
    const duration_minutes = Math.round((bestRoute.duration / 60) * 100) / 100;
    const result: DirectionsResult = {
      distance_km,
      duration_minutes,
      polyline: bestRoute.geometry,
    };
```

Change to:

```ts
    const distance_km = Math.round((bestRoute.distance / 1000) * 100) / 100;
    const duration_minutes = Math.round((bestRoute.duration / 60) * 100) / 100;

    const rawSteps = bestRoute.legs?.[0]?.steps ?? [];
    const steps: ManeuverStep[] = rawSteps
      .filter((s) => s.distance >= 50)
      .map((s) => ({
        maneuver_type: s.maneuver.type,
        maneuver_modifier: s.maneuver.modifier,
        name: s.name,
        distance: s.distance,
        geometry: s.geometry,
      }));

    const result: DirectionsResult = {
      distance_km,
      duration_minutes,
      polyline: bestRoute.geometry,
      steps,
    };
```

- [ ] **Step 5: Update fallback (Haversine) to return empty steps**

The fallback at lines 262-266 returns `{ distance_km, duration_minutes, polyline: '' }`. Change to:

```ts
    return { distance_km, duration_minutes, polyline: '', steps: [] };
```

- [ ] **Step 6: Update test mode mock to include steps**

The test mode mock at line 212 returns `{ distance_km: 5.2, duration_minutes: 12, polyline: 'mock_polyline' }`. Change to:

```ts
      return { distance_km: 5.2, duration_minutes: 12, polyline: 'mock_polyline', steps: [] };
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/shared/lib/geo.ts
git commit -m "feat(backend): expose maneuver steps in directions response"
```

---

### Task 2: Backend — Update directions test to assert steps field

**Files:**
- Modify: `apps/backend/src/features/maps/maps.test.ts`

**Interfaces:**
- Consumes: `DirectionsResult.steps: ManeuverStep[]` from Task 1

- [ ] **Step 1: Add steps assertions to the 'directions returns route' test**

In the test at lines 129-144, after `expect(data.polyline).toBeString();`, add:

```ts
    expect(Array.isArray(data.steps)).toBe(true);
```

The full test body becomes:

```ts
  test('directions returns route', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/directions?origin_lat=-34.6037&origin_lng=-58.3816&dest_lat=-34.6158&dest_lng=-58.4333',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.duration_minutes).toBeNumber();
    expect(data.polyline).toBeString();
    expect(Array.isArray(data.steps)).toBe(true);
  });
```

- [ ] **Step 2: Add steps assertion to the 'directions should score alternative routes' test**

After line 161 (`expect(data.polyline.length).toBeGreaterThan(0);`), add:

```ts
    expect(Array.isArray(data.steps)).toBe(true);
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun test
```

Expected: all tests pass, including the maps tests.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/maps/maps.test.ts
git commit -m "test(backend): verify steps field in directions response"
```

---

### Task 3: Mobile — Create maneuver utility module

**Files:**
- Create: `apps/mobile/src/lib/maneuver.ts`

**Interfaces:**
- Produces: `maneuverToText(type: string, modifier?: string): string`
- Produces: `getStepEndpoint(encodedGeometry: string): [number, number]`
- Consumes: `decodePolyline` from `./polyline`

- [ ] **Step 1: Create the module with maneuverToText**

Write `apps/mobile/src/lib/maneuver.ts`:

```ts
import { decodePolyline } from './polyline';

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function maneuverToText(type: string, modifier?: string): string {
  if (type === 'depart') return '';

  if (type === 'arrive') {
    if (modifier === 'left') return 'Destino a la izquierda';
    if (modifier === 'right') return 'Destino a la derecha';
    return 'Llegando a destino';
  }

  if (type === 'new name') {
    if (modifier === 'straight' || !modifier) return 'Continuar por';
    return 'Continuar por';
  }

  if (type === 'roundabout') {
    if (modifier === 'straight' || !modifier) return 'Continuar en la rotonda';
    return `En la rotonda, ${modifierToText(modifier)}`;
  }

  if (type === 'merge') return 'Incorporarse';
  if (type === 'fork') return modifier ? `Mantenerse a la ${modifierToText(modifier)}` : 'Mantenerse';

  if (type === 'continue') return 'Continuar';
  if (type === 'end of road') {
    return modifier ? `Al final, ${modifierToText(modifier)}` : 'Al final de la calle';
  }

  if (type === 'turn') {
    const action = modifier ? `${modifierToText(modifier)}` : 'girar';
    return capitalize(action);
  }

  return 'Continuar';
}

function modifierToText(modifier: string): string {
  switch (modifier) {
    case 'left': return 'girar a la izquierda';
    case 'right': return 'girar a la derecha';
    case 'slight left': return 'girar ligeramente a la izquierda';
    case 'slight right': return 'girar ligeramente a la derecha';
    case 'sharp left': return 'girar cerradamente a la izquierda';
    case 'sharp right': return 'girar cerradamente a la derecha';
    case 'straight': return 'seguir derecho';
    case 'uturn': return 'hacer un giro en U';
    default: return modifier;
  }
}

export function getStepEndpoint(encodedGeometry: string): [number, number] | null {
  const coords = decodePolyline(encodedGeometry);
  if (coords.length === 0) return null;
  return coords[coords.length - 1];
}
```

- [ ] **Step 2: Write unit tests for maneuverToText**

Create `apps/mobile/src/__tests__/lib/maneuver.test.ts`:

```ts
import { maneuverToText, getStepEndpoint } from '../../lib/maneuver';

describe('maneuverToText', () => {
  test('depart returns empty string', () => {
    expect(maneuverToText('depart')).toBe('');
  });

  test('arrive with no modifier returns llegando', () => {
    expect(maneuverToText('arrive')).toBe('Llegando a destino');
  });

  test('arrive left', () => {
    expect(maneuverToText('arrive', 'left')).toBe('Destino a la izquierda');
  });

  test('arrive right', () => {
    expect(maneuverToText('arrive', 'right')).toBe('Destino a la derecha');
  });

  test('turn left', () => {
    expect(maneuverToText('turn', 'left')).toBe('Girar a la izquierda');
  });

  test('turn right', () => {
    expect(maneuverToText('turn', 'right')).toBe('Girar a la derecha');
  });

  test('turn slight left', () => {
    expect(maneuverToText('turn', 'slight left')).toBe('Girar ligeramente a la izquierda');
  });

  test('roundabout', () => {
    expect(maneuverToText('roundabout')).toBe('Continuar en la rotonda');
  });

  test('roundabout left', () => {
    expect(maneuverToText('roundabout', 'left')).toBe('En la rotonda, girar a la izquierda');
  });

  test('merge', () => {
    expect(maneuverToText('merge')).toBe('Incorporarse');
  });

  test('fork left', () => {
    expect(maneuverToText('fork', 'left')).toBe('Mantenerse a la izquierda');
  });

  test('new name', () => {
    expect(maneuverToText('new name')).toBe('Continuar por');
  });

  test('unknown type returns continuar', () => {
    expect(maneuverToText('unknown_type')).toBe('Continuar');
  });

  test('uturn', () => {
    expect(maneuverToText('turn', 'uturn')).toBe('Hacer un giro en U');
  });

  test('end of road', () => {
    expect(maneuverToText('end of road', 'left')).toBe('Al final, Girar a la izquierda');
  });

  test('sharp turn', () => {
    expect(maneuverToText('turn', 'sharp left')).toBe('Girar cerradamente a la izquierda');
  });
});

describe('getStepEndpoint', () => {
  test('returns last coordinate of decoded polyline', () => {
    const endpoint = getStepEndpoint('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(endpoint).not.toBeNull();
    expect(endpoint!).toHaveLength(2);
    expect(typeof endpoint![0]).toBe('number');
    expect(typeof endpoint![1]).toBe('number');
  });

  test('returns null for empty geometry', () => {
    expect(getStepEndpoint('')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun --filter @lifty/mobile test -- --testPathPattern="maneuver"
```

Expected: all maneuver tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/maneuver.ts apps/mobile/src/__tests__/lib/maneuver.test.ts
git commit -m "feat(mobile): add maneuver text translation and step endpoint utilities"
```

---

### Task 4: Mobile — Create useManeuverInstructions hook

**Files:**
- Create: `apps/mobile/src/hooks/useManeuverInstructions.ts`

**Interfaces:**
- Consumes: `maneuverToText` and `getStepEndpoint` from `../lib/maneuver`
- Consumes: `haversineDistance` from `../lib/geo`
- Produces: `useManeuverInstructions(steps, lat, lng): { instruction: string | null }`

- [ ] **Step 1: Create the hook**

Write `apps/mobile/src/hooks/useManeuverInstructions.ts`:

```ts
import { useRef } from 'react';
import { haversineDistance } from '../lib/geo';
import { getStepEndpoint, maneuverToText } from '../lib/maneuver';

export interface ManeuverStep {
  maneuver_type: string;
  maneuver_modifier?: string;
  name: string;
  distance: number;
  geometry: string;
}

const PROXIMITY_THRESHOLD_KM = 0.02;

export function useManeuverInstructions(
  steps: ManeuverStep[],
  lat: number | null,
  lng: number | null,
): { instruction: string | null } {
  const currentStepIndexRef = useRef(0);
  const prevStepsLengthRef = useRef(steps.length);

  if (steps.length !== prevStepsLengthRef.current) {
    currentStepIndexRef.current = 0;
    prevStepsLengthRef.current = steps.length;
  }

  if (!lat || !lng || steps.length === 0) {
    return { instruction: null };
  }

  if (steps[0]?.maneuver_type === 'depart') {
    currentStepIndexRef.current = Math.max(currentStepIndexRef.current, 1);
  }

  if (currentStepIndexRef.current >= steps.length) return { instruction: null };

  const currentStep = steps[currentStepIndexRef.current];

  const endpoint = getStepEndpoint(currentStep.geometry);
  if (!endpoint) return { instruction: null };

  const [endpointLng, endpointLat] = endpoint;
  const distKm = haversineDistance(lat, lng, endpointLat, endpointLng);

  if (distKm < PROXIMITY_THRESHOLD_KM) {
    currentStepIndexRef.current += 1;
    if (currentStepIndexRef.current >= steps.length) return { instruction: null };

    const nextStep = steps[currentStepIndexRef.current];
    if (nextStep.maneuver_type === 'arrive') {
      return { instruction: 'Llegando a destino' };
    }

    const action = maneuverToText(nextStep.maneuver_type, nextStep.maneuver_modifier);
    if (!action) return { instruction: null };

    const street = nextStep.name ? ` en ${nextStep.name}` : '';
    const meters = Math.round(nextStep.distance);
    return { instruction: `En ${meters}m, ${action}${street}` };
  }

  if (currentStep.maneuver_type === 'arrive') {
    return { instruction: 'Llegando a destino' };
  }

  const action = maneuverToText(currentStep.maneuver_type, currentStep.maneuver_modifier);
  if (!action) return { instruction: null };

  const street = currentStep.name ? ` en ${currentStep.name}` : '';
  const meters = Math.round(distKm * 1000);
  return { instruction: `En ${meters}m, ${action}${street}` };
}
```

- [ ] **Step 2: Write unit tests**

Create `apps/mobile/src/__tests__/hooks/useManeuverInstructions.test.ts`:

```ts
import { useManeuverInstructions } from '../../hooks/useManeuverInstructions';

function createStep(overrides: Partial<{
  maneuver_type: string;
  maneuver_modifier: string;
  name: string;
  distance: number;
  geometry: string;
}> = {}): import('../../hooks/useManeuverInstructions').ManeuverStep {
  return {
    maneuver_type: 'turn',
    maneuver_modifier: 'right',
    name: 'Av. Corrientes',
    distance: 200,
    geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    ...overrides,
  };
}

describe('useManeuverInstructions', () => {
  test('returns null when lat is null', () => {
    const steps = [createStep()];

    const { instruction } = useManeuverInstructions(steps, null, -58.3816);
    expect(instruction).toBeNull();
  });

  test('returns null when lng is null', () => {
    const steps = [createStep()];

    const { instruction } = useManeuverInstructions(steps, -34.6037, null);
    expect(instruction).toBeNull();
  });

  test('returns null when steps is empty', () => {
    const { instruction } = useManeuverInstructions([], -34.6037, -58.3816);
    expect(instruction).toBeNull();
  });

  test('skips depart step', () => {
    const steps = [
      createStep({ maneuver_type: 'depart', name: 'Start St', geometry: '' }),
      createStep({ maneuver_type: 'turn', maneuver_modifier: 'right', name: 'Av. Corrientes', distance: 200, geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }),
    ];

    const { instruction } = useManeuverInstructions(steps, -34.6037, -58.3816);
    expect(instruction).not.toBeNull();
    expect(instruction).not.toBe('');
  });

  test('returns instruction with distance, action and street name', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'right',
        name: 'Av. Corrientes',
        distance: 200,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const { instruction } = useManeuverInstructions(steps, -34.6037, -58.3816);
    expect(instruction).not.toBeNull();
    expect(instruction).toContain('Girar a la derecha');
    expect(instruction).toContain('Av. Corrientes');
  });

  test('returns instruction without street name if empty', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'left',
        name: '',
        distance: 300,
      }),
    ];

    const { instruction } = useManeuverInstructions(steps, -34.6037, -58.3816);
    expect(instruction).not.toBeNull();
    expect(instruction).toContain('Girar a la izquierda');
  });

  test('returns null when past all steps', () => {
    const steps: ReturnType<typeof createStep>[] = [];

    const { instruction } = useManeuverInstructions(steps, -34.6037, -58.3816);
    expect(instruction).toBeNull();
  });

  test('shows arrive message for last step', () => {
    const steps = [
      createStep({ maneuver_type: 'arrive', name: '', distance: 50 }),
    ];

    const { instruction } = useManeuverInstructions(steps, -34.6037, -58.3816);
    expect(instruction).toBe('Llegando a destino');
  });

  test('resets index when steps array changes length', () => {
    const steps1 = [createStep({ name: 'Calle 1', distance: 200 })];
    const { instruction: i1 } = useManeuverInstructions(steps1, -34.6037, -58.3816);
    expect(i1).not.toBeNull();

    const steps2 = [createStep({ name: 'Calle 2', distance: 300 }), createStep({ name: 'Calle 3', distance: 150 })];
    const { instruction: i2 } = useManeuverInstructions(steps2, -34.6037, -58.3816);
    expect(i2).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun --filter @lifty/mobile test -- --testPathPattern="useManeuverInstructions"
```

Expected: all hook tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useManeuverInstructions.ts apps/mobile/src/__tests__/hooks/useManeuverInstructions.test.ts
git commit -m "feat(mobile): add useManeuverInstructions hook for turn-by-turn navigation"
```

---

### Task 5: Mobile — Integrate instructions into NavigationScreen

**Files:**
- Modify: `apps/mobile/src/screens/NavigationScreen.tsx`

**Interfaces:**
- Consumes: `useManeuverInstructions` from `../hooks/useManeuverInstructions`
- Consumes: `ManeuverStep` type from `../hooks/useManeuverInstructions`

- [ ] **Step 1: Add import for useManeuverInstructions**

Add import after the existing imports (after line 22):

```ts
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
```

- [ ] **Step 2: Extract steps from directions response and use hook**

Add state for steps and use the hook. After line 38 (`const [nearPassenger, setNearPassenger] = useState(false);`), add:

```ts
  const [steps, setSteps] = useState<import('../hooks/useManeuverInstructions').ManeuverStep[]>([]);
```

Then after line 91 (end of `fetchDirections`), add hook usage. Between `fetchDirections` and `openWaze`, add:

Place after the `fetchDirections` function and before `openWaze` function (around line 92):

```ts
  const { instruction } = useManeuverInstructions(steps, locationLat, locationLng);
```

- [ ] **Step 3: Set steps from directions response**

In `fetchDirections`, after `setRouteCoords(coords);`, add:

```ts
      setSteps(data.steps ?? []);
```

- [ ] **Step 4: Display instruction in bottomCard**

After the ETA line (lines 192-196) and before the commsButtons, add the instruction Text. Insert between the ETA block and the commsButtons View (after line 196):

```tsx
        {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
```

- [ ] **Step 5: Add instruction style**

In the `styles` StyleSheet, add the `instruction` style entry:

```ts
  instruction: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    backgroundColor: 'rgba(0, 194, 179, 0.08)',
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
```

- [ ] **Step 6: Run typecheck**

```bash
bun --filter @lifty/mobile exec tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/NavigationScreen.tsx
git commit -m "feat(mobile): display turn-by-turn instructions in NavigationScreen"
```

---

### Task 6: Mobile — Integrate instructions into TripInProgressScreen

**Files:**
- Modify: `apps/mobile/src/screens/TripInProgressScreen.tsx`

**Interfaces:**
- Consumes: `useManeuverInstructions` from `../hooks/useManeuverInstructions`

- [ ] **Step 1: Add import**

After line 18 (after `import { useTripStore } from '../store/tripStore';`), add:

```ts
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
```

- [ ] **Step 2: Add steps state and extract from directions response**

After line 31 (`const totalDistKmRef = useRef<number | null>(trip?.distance_km ?? null);`), add:

```ts
  const [steps, setSteps] = useState<import('../hooks/useManeuverInstructions').ManeuverStep[]>([]);
```

In `fetchDirections` (inside the try block after `setRouteCoords(coords);`), add:

```ts
      setSteps(data.steps ?? []);
```

- [ ] **Step 3: Use the hook and display instruction**

After line 98 (end of the `progress` calculation), add:

```ts
  const { instruction } = useManeuverInstructions(steps, locationLat, locationLng);
```

After the ETA block (lines 112-116) and before the progressBar (line 117), insert:

```tsx
        {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
```

- [ ] **Step 4: Add instruction style**

In the `styles` StyleSheet, add:

```ts
  instruction: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    backgroundColor: 'rgba(0, 194, 179, 0.08)',
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
```

- [ ] **Step 5: Run typecheck**

```bash
bun --filter @lifty/mobile exec tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/TripInProgressScreen.tsx
git commit -m "feat(mobile): display turn-by-turn instructions in TripInProgressScreen"
```

---

### Task 7: Verification — Full lint, typecheck, and test run

**Files:**
- None (verification only)

- [ ] **Step 1: Run backend tests**

```bash
cd apps/backend && bun test
```

Expected: all tests pass (including maps.test.ts).

- [ ] **Step 2: Run mobile typecheck**

```bash
bun --filter @lifty/mobile exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run mobile tests**

```bash
bun --filter @lifty/mobile test
```

Expected: all tests pass (including maneuver and useManeuverInstructions).

- [ ] **Step 4: Run biome lint**

```bash
bun run lint
```

Expected: no issues (or fix any that arise).

