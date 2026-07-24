# Demand Heatmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add demand heatmap to OnlineScreen and ActiveScreen by computing inverse driver density on the backend and rendering it as a MapLibre GL JS native heatmap layer.

**Architecture:** Backend endpoint `GET /maps/heatmap` receives viewport bounds, builds a grid, queries `driver_locations` within the area, scores each cell by inverse driver density, and returns weighted GeoJSON points. Mobile MapView renders them via a native `heatmap` layer type in the WebView. OnlineScreen and ActiveScreen poll the endpoint every 45s.

**Tech Stack:** Backend: Bun + Elysia + Drizzle ORM + PostgreSQL. Mobile: Expo SDK 56 + React Native + MapLibre GL JS 4.7.1 (in WebView).

**Spec:** `docs/superpowers/specs/2026-07-24-demand-heatmap-design.md`

## Global Constraints

- All backend routes require auth (`requireAuth: true`).
- Use existing patterns: `safeCall` wrapper, Elysia `t` schemas, `AppError` subclasses.
- Drizzle ORM with PostgreSQL pool (port 6543, transaction mode).
- Mobile: `StyleSheet.create()` at bottom, `theme` from `src/theme/index.ts`, `@/*` alias.
- Mobile: `apiClient` from `src/api/client.ts` with `getValidated()` for typed responses.
- MapLibre GL JS style URL: `https://tiles.openfreemap.org/styles/liberty`.
- No PostGIS. Use Haversine in SQL (as in `findNearbyOnlineDrivers`).
- Default grid size: 5 (5x5 = 25 cells). Max: 10.
- Poll interval: 45 seconds on mobile.
- Heatmap color ramp: blue → cyan → yellow → red (defined in spec).
- Error degrade gracefully: last known heatmap stays visible, no error surface.

---

### Task 1: Backend heatmap service (computeHeatmap)

**Files:**
- Create: `apps/backend/src/features/maps/heatmap-service.ts`
- Modify: `apps/backend/src/features/maps/service.ts`

**Interfaces:**
- Produces: `export interface HeatmapPoint { coordinate: [lng: number, lat: number]; weight: number }`
- Produces: `export function computeHeatmap(bounds: HeatmapBounds, gridSize: number, driverLocations: HeatmapDriverRow[]): HeatmapPoint[]`
- Produces: `export interface HeatmapBounds { sw_lat: number; sw_lng: number; ne_lat: number; ne_lng: number }`
- Produces: `export interface HeatmapDriverRow { lat: number; lng: number }`

- [ ] **Step 1: Create `apps/backend/src/features/maps/heatmap-service.ts`**

```typescript
export interface HeatmapBounds {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
}

export interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

export interface HeatmapDriverRow {
  lat: number;
  lng: number;
}

interface GridCell {
  latMin: number;
  lngMin: number;
  latMax: number;
  lngMax: number;
  centroidLat: number;
  centroidLng: number;
}

function buildGrid(bounds: HeatmapBounds, gridSize: number): GridCell[] {
  const latStep = (bounds.ne_lat - bounds.sw_lat) / gridSize;
  const lngStep = (bounds.ne_lng - bounds.sw_lng) / gridSize;
  const cells: GridCell[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const latMin = bounds.sw_lat + row * latStep;
      const lngMin = bounds.sw_lng + col * lngStep;
      const latMax = latMin + latStep;
      const lngMax = lngMin + lngStep;
      cells.push({
        latMin,
        lngMin,
        latMax,
        lngMax,
        centroidLat: (latMin + latMax) / 2,
        centroidLng: (lngMin + lngMax) / 2,
      });
    }
  }

  return cells;
}

function countDriversPerCell(drivers: HeatmapDriverRow[], cells: GridCell[]): number[] {
  const counts = new Array<number>(cells.length).fill(0);

  for (const driver of drivers) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (
        driver.lat >= cell.latMin &&
        driver.lat <= cell.latMax &&
        driver.lng >= cell.lngMin &&
        driver.lng <= cell.lngMax
      ) {
        counts[i]++;
        break;
      }
    }
  }

  return counts;
}

function nonLinearScale(ratio: number): number {
  return Math.pow(ratio, 2);
}

export function computeHeatmap(
  bounds: HeatmapBounds,
  gridSize: number,
  drivers: HeatmapDriverRow[],
): HeatmapPoint[] {
  const cells = buildGrid(bounds, gridSize);
  const counts = countDriversPerCell(drivers, cells);
  const maxCount = Math.max(...counts, 0);

  const points: HeatmapPoint[] = [];

  for (let i = 0; i < cells.length; i++) {
    let weight: number;
    if (maxCount === 0) {
      weight = 1.0;
    } else {
      const ratio = 1 - counts[i] / maxCount;
      weight = nonLinearScale(ratio);
    }

    if (weight > 0) {
      points.push({
        coordinate: [cells[i].centroidLng, cells[i].centroidLat],
        weight: Math.round(weight * 100) / 100,
      });
    }
  }

  return points;
}
```

- [ ] **Step 2: Add `getHeatmap` method to `apps/backend/src/features/maps/service.ts`**

Add after line 10 (`} from '../../shared/lib/geo';`):

```typescript
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers } from '../../shared/db/schema';
import { type HeatmapBounds, type HeatmapPoint, computeHeatmap } from './heatmap-service';
```

Add inside `mapsService` object after the `fareEstimate` method (before closing `};` on line 62):

```typescript
  async getHeatmap(
    sw_lat: number,
    sw_lng: number,
    ne_lat: number,
    ne_lng: number,
    gridSize = 5,
  ): Promise<{ type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { weight: number } }> }> {
    const bounds: HeatmapBounds = { sw_lat, sw_lng, ne_lat, ne_lng };

    const rows = await db
      .select({ lat: driverLocations.lat, lng: driverLocations.lng })
      .from(driverLocations)
      .innerJoin(drivers, eq(drivers.id, driverLocations.driver_id))
      .where(
        and(
          eq(drivers.is_online, true),
          sql`${driverLocations.lat} >= ${sw_lat}`,
          sql`${driverLocations.lat} <= ${ne_lat}`,
          sql`${driverLocations.lng} >= ${sw_lng}`,
          sql`${driverLocations.lng} <= ${ne_lng}`,
        ),
      );

    const points = computeHeatmap(bounds, gridSize, rows);

    return {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.coordinate },
        properties: { weight: p.weight },
      })),
    };
  },
```

The full `service.ts` after modification should have `mapsService` with these keys: `autocomplete`, `geocode`, `directions`, `fareEstimate`, `getHeatmap`.

- [ ] **Step 3: Run backend typecheck to verify no compilation errors**

```bash
bun --filter @lifty/backend tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/maps/heatmap-service.ts apps/backend/src/features/maps/service.ts
git commit -m "feat(backend): add computeHeatmap and getHeatmap service"
```

---

### Task 2: Backend heatmap route and schema

**Files:**
- Modify: `apps/backend/src/features/maps/schema.ts`
- Modify: `apps/backend/src/features/maps/routes.ts`

**Interfaces:**
- Consumes: `getHeatmap(sw_lat, sw_lng, ne_lat, ne_lng, gridSize?)` from `mapsService` (Task 1)
- Produces: GET `/maps/heatmap?sw_lat=&sw_lng=&ne_lat=&ne_lng=&grid_size=5` route

- [ ] **Step 1: Add `heatmapQuery` schema to `apps/backend/src/features/maps/schema.ts`**

Add at end of file (after line 26):

```typescript
export const heatmapQuery = t.Object({
  sw_lat: t.Number(),
  sw_lng: t.Number(),
  ne_lat: t.Number(),
  ne_lng: t.Number(),
  grid_size: t.Optional(t.Number({ minimum: 1, maximum: 10, default: 5 })),
});
```

- [ ] **Step 2: Import `heatmapQuery` in `apps/backend/src/features/maps/routes.ts`**

Change line 3 from:
```typescript
import { autocompleteQuery, directionsQuery, fareEstimateBody, geocodeQuery } from './schema';
```
to:
```typescript
import { autocompleteQuery, directionsQuery, fareEstimateBody, geocodeQuery, heatmapQuery } from './schema';
```

- [ ] **Step 3: Add `/heatmap` route in `apps/backend/src/features/maps/routes.ts`**

Add before the closing semicolon on line 54 (after the `/fare-estimate` route):

```typescript
  .get(
    '/heatmap',
    ({ query, set }) =>
      safeCall(
        () =>
          mapsService.getHeatmap(
            query.sw_lat,
            query.sw_lng,
            query.ne_lat,
            query.ne_lng,
            query.grid_size,
          ),
        set,
      ),
    { query: heatmapQuery, requireAuth: true },
  );
```

- [ ] **Step 4: Run backend typecheck**

```bash
bun --filter @lifty/backend tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/maps/schema.ts apps/backend/src/features/maps/routes.ts
git commit -m "feat(backend): add GET /maps/heatmap endpoint"
```

---

### Task 3: Backend heatmap tests

**Files:**
- Modify: `apps/backend/src/features/maps/maps.test.ts`

**Interfaces:**
- Consumes: `GET /maps/heatmap` route (Task 2)
- Consumes: `driverLocations`, `drivers` from `shared/db/schema`

- [ ] **Step 1: Add imports and DB setup in `apps/backend/src/features/maps/maps.test.ts`**

Change line 7 from:
```typescript
import { users } from '../../shared/db/schema';
```
to:
```typescript
import { driverLocations, drivers, users } from '../../shared/db/schema';
```

Change `truncateTables` function (line 12-15) from:
```typescript
async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}
```
to:
```typescript
async function truncateTables() {
  const db = getDb();
  await db.delete(driverLocations);
  await db.delete(drivers);
  await db.delete(users);
}
```

Add a helper function after `registerAndGetToken` (after line 37):

```typescript
async function registerDriverAndGetToken(phone: string, _password: string): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  const [driver] = await db
    .insert(drivers)
    .values({ user_id: user.id, is_online: true })
    .returning({ id: drivers.id });
  await db.insert(driverLocations).values({ driver_id: driver.id, lat: -34.6037, lng: -58.3816 });
  return { token: createTestToken(user.id), driverId: driver.id };
}
```

- [ ] **Step 2: Add heatmap describe block**

Add after the last test in the `Maps Proxy` describe block (after line 207):

```typescript
describe('Heatmap', () => {
  const phone = '+5492612222333';
  const password = 'testPass123';

  test('heatmap returns FeatureCollection for valid bounds', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.type).toBe('FeatureCollection');
    expect(Array.isArray(data.features)).toBe(true);
  });

  test('heatmap features have weight between 0 and 1', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
      undefined,
      token,
    );

    expect(status).toBe(200);
    for (const f of data.features) {
      expect(f.geometry.type).toBe('Point');
      expect(Array.isArray(f.geometry.coordinates)).toBe(true);
      expect(f.geometry.coordinates).toHaveLength(2);
      expect(f.properties.weight).toBeNumber();
      expect(f.properties.weight).toBeGreaterThanOrEqual(0);
      expect(f.properties.weight).toBeLessThanOrEqual(1);
    }
  });

  test('heatmap returns empty features when no drivers in area', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-40.0&sw_lng=-60.0&ne_lat=-39.9&ne_lng=-59.9',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data.features)).toBe(true);
    expect(data.features.length).toBe(0);
  });

  test('heatmap respects grid_size parameter', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { data: dataSmall } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=2',
      undefined,
      token,
    );

    const { data: dataLarge } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=10',
      undefined,
      token,
    );

    expect(dataLarge.features.length).toBeGreaterThanOrEqual(dataSmall.features.length);
  });

  test('heatmap without auth returns 401', async () => {
    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('heatmap with invalid grid_size returns 400', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=30',
      undefined,
      token,
    );

    expect(status).toBe(400);
  });
});
```

- [ ] **Step 3: Run backend tests**

```bash
bun --filter @lifty/backend test
```

Expected: all tests pass (including existing maps tests + 6 new heatmap tests).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/maps/maps.test.ts
git commit -m "test(backend): add heatmap endpoint tests"
```

---

### Task 4: Mobile — MapView heatmap support

**Files:**
- Modify: `apps/mobile/src/components/MapView.tsx` (lines 24-32 for `MapViewProps`, lines 258-260 for HTML `<script>`, lines 262-362 for React Native component, lines 407-452 for styles)

**Interfaces:**
- Produces: `MapViewProps.heatmapPoints?: Array<{ coordinate: [lng: number, lat: number]; weight: number }>`
- Produces: WebView message `{ type: 'heatmap', points }` (RN → WebView)

- [ ] **Step 1: Add `heatmapPoints` to `MapViewProps` interface**

In `apps/mobile/src/components/MapView.tsx`, change lines 24-32 from:
```typescript
interface MapViewProps {
  centerCoordinate?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  followUserLocation?: boolean;
  style?: ViewStyle;
  onError?: () => void;
}
```
to:
```typescript
interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

interface MapViewProps {
  centerCoordinate?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  heatmapPoints?: HeatmapPoint[];
  followUserLocation?: boolean;
  style?: ViewStyle;
  onError?: () => void;
}
```

- [ ] **Step 2: Add heatmap HTML-side JS handler**

In the `MAP_HTML` template constant, add the heatmap source/layer handler before the `window.addEventListener('message', ...)` block. Add after the `stopFollowUser` function (after line 191):

```js
  var HEATMAP_SOURCE_ID = 'heatmap-source';
  var HEATMAP_LAYER_ID = 'heatmap-layer';

  function updateHeatmap(points) {
    if (!points || points.length === 0) {
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
      return;
    }

    var geojson = {
      type: 'FeatureCollection',
      features: points.map(function (p) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coordinate },
          properties: { weight: p.weight },
        };
      }),
    };

    var existing = map.getSource(HEATMAP_SOURCE_ID);
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 0.6,
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 8,
            12, 15,
            15, 30,
            18, 60,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(33,102,172,0)',
            0.2,  'rgb(103,169,207)',
            0.4,  'rgb(209,229,240)',
            0.6,  'rgb(253,219,199)',
            0.8,  'rgb(239,138,98)',
            1.0,  'rgb(178,24,43)',
          ],
          'heatmap-opacity': 0.7,
        },
      });
    }
  }
```

- [ ] **Step 3: Add `heatmap` case in HTML message listener**

In the `window.addEventListener('message', ...)` switch block, add a new case before the `default:` (after line 249, before `}` that closes switch):

```
      case 'heatmap':
        updateHeatmap(msg.points || []);
        break;
```

- [ ] **Step 4: Add `heatmapPoints` prop destructuring in React Native component**

Change line 262-270 from:
```typescript
export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  followUserLocation = false,
  style,
  onError,
}) => {
```
to:
```typescript
export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  heatmapPoints,
  followUserLocation = false,
  style,
  onError,
}) => {
```

- [ ] **Step 5: Add `useEffect` to send heatmap data to WebView**

Add after the `followUserLocation` `useEffect` block (after line 341):

```typescript
  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'heatmap',
        points: heatmapPoints || [],
      }),
    );
  }, [heatmapPoints, isLoaded]);
```

- [ ] **Step 6: Run mobile typecheck**

```bash
bun --filter @lifty/mobile tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/MapView.tsx
git commit -m "feat(mobile): add heatmap support to MapView component"
```

---

### Task 5: Mobile — OnlineScreen heatmap polling

**Files:**
- Modify: `apps/mobile/src/screens/OnlineScreen.tsx`

**Interfaces:**
- Consumes: `MapView.heatmapPoints` prop (Task 4)
- Consumes: `useLocationStore` from `src/store/locationStore`
- Consumes: `apiClient` from `src/api/client`

- [ ] **Step 1: Add import for `useLocationStore`**

In `apps/mobile/src/screens/OnlineScreen.tsx`, add after line 16 (`} from '../hooks/useAuth';`):

```typescript
import { useLocationStore } from '../store/locationStore';
```

Also add `useRef` to the React import on line 3:
```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Add heatmap state and polling in OnlineScreen**

Add after the `menuVisible` state declaration (line 28):

```typescript
  const [heatmapPoints, setHeatmapPoints] = useState<Array<{ coordinate: [number, number]; weight: number }>>([]);
  const lat = useLocationStore((s) => s.lat);
  const lng = useLocationStore((s) => s.lng);
  const heatmapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 3: Add heatmap polling useEffect**

Add after the existing `useEffect` block that checks driver status (after line 144):

```typescript
  useEffect(() => {
    const fetchHeatmap = async () => {
      if (lat == null || lng == null) return;
      try {
        const res = await apiClient.get('/maps/heatmap', {
          params: {
            sw_lat: lat - 0.05,
            sw_lng: lng - 0.05,
            ne_lat: lat + 0.05,
            ne_lng: lng + 0.05,
          },
        });
        const features = res.data?.features ?? res.data?.data?.features ?? [];
        setHeatmapPoints(
          features.map((f: any) => ({
            coordinate: f.geometry.coordinates as [number, number],
            weight: f.properties.weight as number,
          })),
        );
      } catch {
        // keep previous heatmap data on error
      }
    };

    fetchHeatmap();
    heatmapIntervalRef.current = setInterval(fetchHeatmap, 45_000);

    return () => {
      if (heatmapIntervalRef.current) clearInterval(heatmapIntervalRef.current);
    };
  }, [lat, lng]);
```

- [ ] **Step 4: Pass `heatmapPoints` to MapView**

Change line 252 from:
```tsx
          <MapView followUserLocation />
```
to:
```tsx
          <MapView followUserLocation heatmapPoints={heatmapPoints} />
```

- [ ] **Step 5: Run mobile typecheck**

```bash
bun --filter @lifty/mobile tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/OnlineScreen.tsx apps/mobile/src/components/MapView.tsx
git commit -m "feat(mobile): add demand heatmap polling to OnlineScreen"
```

---

### Task 6: Mobile — ActiveScreen heatmap polling

**Files:**
- Modify: `apps/mobile/src/screens/ActiveScreen.tsx`

**Interfaces:**
- Consumes: `MapView.heatmapPoints` prop (Task 4)
- Consumes: `useLocationStore` from `src/store/locationStore`
- Consumes: `apiClient` from `src/api/client`

- [ ] **Step 1: Add imports in ActiveScreen**

In `apps/mobile/src/screens/ActiveScreen.tsx`, add after line 5 (`import { apiClient } from '../api/client';`):

```typescript
import { useLocationStore } from '../store/locationStore';
```

- [ ] **Step 2: Add heatmap state and polling**

Add after line 22 (`const [toggleError, setToggleError] = useState<string | null>(null);`):

```typescript
  const [heatmapPoints, setHeatmapPoints] = useState<Array<{ coordinate: [number, number]; weight: number }>>([]);
  const lat = useLocationStore((s) => s.lat);
  const lng = useLocationStore((s) => s.lng);
  const heatmapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 3: Add heatmap polling useEffect**

Add after the existing `useEffect` block that sets up heartbeat + tracking (the first `useEffect`, after line 42):

```typescript
  useEffect(() => {
    const fetchHeatmap = async () => {
      if (lat == null || lng == null) return;
      try {
        const res = await apiClient.get('/maps/heatmap', {
          params: {
            sw_lat: lat - 0.05,
            sw_lng: lng - 0.05,
            ne_lat: lat + 0.05,
            ne_lng: lng + 0.05,
          },
        });
        const features = res.data?.features ?? res.data?.data?.features ?? [];
        setHeatmapPoints(
          features.map((f: any) => ({
            coordinate: f.geometry.coordinates as [number, number],
            weight: f.properties.weight as number,
          })),
        );
      } catch {
        // keep previous heatmap data on error
      }
    };

    fetchHeatmap();
    heatmapIntervalRef.current = setInterval(fetchHeatmap, 45_000);

    return () => {
      if (heatmapIntervalRef.current) clearInterval(heatmapIntervalRef.current);
    };
  }, [lat, lng]);
```

- [ ] **Step 4: Pass `heatmapPoints` to MapView**

Change line 133 from:
```tsx
      <MapView style={StyleSheet.absoluteFill as any} followUserLocation />
```
to:
```tsx
      <MapView style={StyleSheet.absoluteFill as any} followUserLocation heatmapPoints={heatmapPoints} />
```

- [ ] **Step 5: Run mobile typecheck**

```bash
bun --filter @lifty/mobile tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ActiveScreen.tsx
git commit -m "feat(mobile): add demand heatmap polling to ActiveScreen"
```

---

### Task 7: Run full validation

**Files:** None modified. Validation only.

- [ ] **Step 1: Run backend tests**

```bash
bun --filter @lifty/backend test
```

Expected: all tests pass (including new heatmap tests).

- [ ] **Step 2: Run mobile typecheck**

```bash
bun --filter @lifty/mobile tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

Expected: no lint errors.

- [ ] **Step 4: Commit any fixes if needed**
