# Demand Heatmap on Maps — Design

## Context

Issue [#133](https://github.com/LIfty/software-lifty/issues/133): Maps in `OnlineScreen` and `ActiveScreen` don't show high-demand zones. The heatmap guides drivers toward areas where rides are more likely.

## Approach

**Approach B: Demand point cloud + MapLibre native heatmap layer** (chosen over polygon grid and Redis-cached alternatives).

- Backend computes demand-weighted points from driver density (fewer drivers = higher demand).
- MapLibre GL JS renders a native `heatmap` layer for GPU-accelerated, smooth interpolation.
- Service designed with an interface that accepts passenger-origin data later when the passenger app exists.

---

## Architecture

```
ActiveScreen / OnlineScreen
        │
        │  Every 45s: GET /maps/heatmap?sw_lat=...&sw_lng=...&ne_lat=...&ne_lng=...
        ▼
┌─────────────────────────────────────┐
│  Backend: /maps/heatmap             │
│  1. Receive viewport bounds          │
│  2. Build NxN grid within bounds     │
│  3. Query driver_locations in area   │
│  4. Score per cell: inverse density  │
│  5. Normalize weights 0-1            │
│  6. Return GeoJSON FeatureCollection │
│     of Points {weight}               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  MapView (WebView + MapLibre GL JS) │
│  - Native heatmap layer             │
│  - weight → heatmap-weight           │
│  - Color ramp: green → yellow → red │
│  - Updates on new data via postMsg   │
└─────────────────────────────────────┘
```

---

## Backend

### Endpoint

`GET /maps/heatmap` — auth required (uses existing `authGuard`).

| Param    | Type   | Required | Description                          |
|----------|--------|----------|--------------------------------------|
| sw_lat   | number | yes      | Southwest corner latitude            |
| sw_lng   | number | yes      | Southwest corner longitude           |
| ne_lat   | number | yes      | Northeast corner latitude            |
| ne_lng   | number | yes      | Northeast corner longitude           |
| grid_size| number | no       | Cells per side (default 5, max 10)   |

### Algorithm (`maps/service.ts`)

```
function getHeatmap(bounds, gridSize):
  cells = buildGrid(bounds.sw, bounds.ne, gridSize)     // gridSize x gridSize cells
  drivers = db.select().from(driverLocations)
            .where(withinBounds(bounds))                  // Haversine filter
  cellCounts = countDriversPerCell(drivers, cells)
  maxCount = max(cellCounts)

  points = []
  for each cell:
    if maxCount == 0:
      weight = 1.0
    else:
      weight = nonLinearScale(1 - cellCount / maxCount)   // curve that amplifies differences
    if weight > 0:
      points.push({ coordinate: cell.centroid, weight })
  return GeoJSON(FeatureCollection, points)
```

**Non-linear scale:** Uses `Math.pow(ratio, 2)` to amplify differences so that truly empty areas stand out sharply while moderately busy areas fade quickly.

### Response shape

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-65.18, -31.93] },
      "properties": { "weight": 0.85 }
    }
  ]
}
```

### Schema (`apps/backend/src/features/maps/heatmap-schema.ts`)

Elysia `t` schemas for query validation and response typing.

### Extensibility

The service accepts an optional `HeatmapOptions` parameter with a `passengerOrigins` field (currently unused). When the passenger app exists, the same endpoint can blend driver-density and passenger-origin weights without changing the mobile-side contract.

### Tests

New tests in `maps.test.ts`:
- Returns FeatureCollection for valid bounds
- Returns empty FeatureCollection when no drivers in area
- All points have weight between 0 and 1
- Respects grid_size parameter
- Returns 401 without auth
- Returns 400 with missing bounds

---

## Mobile

### MapView changes (`apps/mobile/src/components/MapView.tsx`)

**New prop:**
```ts
heatmapPoints?: Array<{ coordinate: [lng, lat]; weight: number }>
```

**New WebView message** (React Native → WebView):
```ts
{ type: 'heatmap', points: [...] }
```

**HTML-side handler** (inside the WebView script):
- On `type: 'heatmap'`, create or update a GeoJSON source `heatmap-source`.
- Add/update a layer of `type: 'heatmap'`:
  - `heatmap-weight`: interpolated from `weight` property
  - `heatmap-intensity`: 0.6
  - `heatmap-radius`: zoom-based scale (larger when zoomed out)
  - `heatmap-color`: green → yellow → red ramp
  - `heatmap-opacity`: 0.7
- If `points` is empty or missing, remove the layer.

**Color ramp:**
```js
heatmap-color: [
  'interpolate', ['linear'], ['heatmap-density'],
  0,    'rgba(33,102,172,0)',
  0.2,  'rgb(103,169,207)',
  0.4,  'rgb(209,229,240)',
  0.6,  'rgb(253,219,199)',
  0.8,  'rgb(239,138,98)',
  1.0,  'rgb(178,24,43)'
]
```

### OnlineScreen (`apps/mobile/src/screens/OnlineScreen.tsx`)

- Import `locationStore` to get the driver's current position.
- Add `useEffect` with 45s interval.
- On each tick: calculate bounds (±0.05° from user position, ~5.5km), call `GET /maps/heatmap`, set `heatmapPoints` state.
- Pass `heatmapPoints` to `<MapView>`.
- Cleanup interval on unmount.
- Shows heatmap always (driver is offline, deciding where to go).
- On endpoint error: keep displaying previous data silently (no toast, no error state).

### ActiveScreen (`apps/mobile/src/screens/ActiveScreen.tsx`)

- Same 45s interval pattern as OnlineScreen.
- Only show heatmap while NOT on an active trip (no `tripRequest` accepted yet).
- Hide heatmap when leaving the screen (cleanup).
- On error: keep previous data, no visible error.

### API types (`apps/mobile/src/api/types.ts`)

Add types for the heatmap response (FeatureCollection, features with weight property).

---

## Edge cases & error handling

| Case                             | Behavior                                              |
|----------------------------------|-------------------------------------------------------|
| No drivers online in viewport    | All cells get weight=1.0 → full heatmap               |
| All drivers in one cell          | One cell at 0, rest at 1.0 → strongest contrast       |
| Backend offline / network error  | Last known heatmap stays visible, no error surface    |
| Bounds crossing 180° meridian    | Not handled (Lifty operates in one city, no issue)    |
| Rapid viewport changes           | New request cancels previous via interval reset       |
| WebView not loaded yet           | Heatmap data queued, applied on `ready` message       |
| Empty heatmap from backend       | Heatmap layer removed from map                        |

---

## Testing strategy

### Backend (`maps.test.ts`)
- Unit: grid cell calculation, driver-to-cell assignment, weight normalization, non-linear scaling
- Integration: full endpoint with real DB (drivers in and out of bounds, empty area, edge coordinates)
- Auth: requires valid token, rejects anonymous

### Mobile
- Unit: heatmap message serialization, bounds calculation from user position
- Manual: verify heatmap layer renders in WebView, interval fires correctly, cleanup on unmount

---

## Non-goals

- No PostGIS or spatial indexing (too heavy for current scale)
- No H3/geohash (overkill; dynamic grid is simpler and viewport-adaptive)
- No passenger-origin blending (deferred to future when passenger app exists)
- No Redis caching for heatmap (real-time driver data changes too fast; caching gives stale results)
