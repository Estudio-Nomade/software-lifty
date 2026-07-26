# Alternative Routes During Trip — Design Spec

**Issue**: [#151](https://github.com/org/lifty/issues/151)
**Date**: 2026-07-26
**Status**: Approved

## Summary

The driver receives no suggestions for alternative routes during the trip. The backend already queries OSRM with `alternatives=true` but returns only the best-scored route. We expose the second-best route as an alternative and let the driver toggle between routes via a floating pill on the map.

## Design Decisions

| Decision | Choice |
|----------|--------|
| When to show alternatives | On demand: pill appears after each poll if backend returned alternatives |
| Max alternatives | 1 (total 2 routes shown) |
| Route selection | Selectable: tap pill toggles which route is active |
| Steps in alternative | Included (full turn-by-turn available after switching) |
| Comparison UI | Simple floating pill: `⏱ 14 min (+3 min)` |

## API Contract

### `GET /maps/directions`

Query params unchanged: `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng`.

Response (new shape, backward-compatible):
```json
{
  "data": {
    "distance_km": 5.2,
    "duration_minutes": 12,
    "polyline": "encoded_polyline_best_route",
    "steps": [
      { "maneuver_type": "turn", "maneuver_modifier": "right", "name": "Av. Corrientes", "distance": 150, "geometry": "..." }
    ],
    "alternatives": [
      {
        "distance_km": 5.8,
        "duration_minutes": 14,
        "polyline": "encoded_polyline_alt_route",
        "steps": [ ... ]
      }
    ]
  }
}
```

- `alternatives` is always present, empty array `[]` when OSRM returns only 1 route.
- The primary route is the best-scored (by `scoreRoute`), alternative is the second-best.

## Backend Changes

### `apps/backend/src/shared/lib/geo.ts`

- **`DirectionsResult` interface**: add `alternatives: DirectionsResult[]` field.
- **`directions()` function**: instead of picking only the best-scored route, sort all OSRM routes by score descending, return `routes[0]` as primary and `routes[1]` (if exists) inside `alternatives`.
- Redis cache key/value updated for the new shape.

### `apps/backend/src/features/maps/schema.ts`

No changes needed (query params unchanged).

### `apps/backend/src/features/maps/service.ts`

No changes needed (return type propagates from `geo.ts`).

### `apps/backend/src/features/maps/maps.test.ts`

- Update mock data to include `alternatives` field.
- Add test: `'directions returns alternative routes when available'`.
- Update existing tests to expect `alternatives` in response.

## Mobile Changes

### `apps/mobile/src/api/types.ts`

Add Zod schema:
```ts
export const directionsResponseSchema = z.object({
  distance_km: z.number(),
  duration_minutes: z.number(),
  polyline: z.string(),
  steps: z.array(maneuverStepSchema),
  alternatives: z.array(z.object({
    distance_km: z.number(),
    duration_minutes: z.number(),
    polyline: z.string(),
    steps: z.array(maneuverStepSchema),
  })),
});
```

### `apps/mobile/src/components/AlternativeRoutePill.tsx` (NEW)

Floating pill component above the bottom card.

Props:
- `primaryTime: number | null` — time of primary route in minutes
- `altTime: number | null` — time of alternative route in minutes
- `onToggle: () => void` — callback when pill is tapped
- `visible: boolean` — whether to show the pill

Visual:
- Position: absolute, bottom offset to sit just above the card
- Background: semi-transparent dark (`rgba(13,43,69,0.85)`)
- Border: 1px ámbar (`#FFB020`)
- Text: white, shows `⏱ Alternativa: {altTime} min ({sign}{delta} min)` — sign is `+` if alternative is slower, `-` if faster. Always computed as `altTime - primaryTime`.
- Rounded pill shape (`borderRadius: 20`)
- Touchable with opacity feedback

### `apps/mobile/src/screens/NavigationScreen.tsx`

New state:
```ts
const [altRouteCoords, setAltRouteCoords] = useState<[number, number][]>([]);
const [altEtaMinutes, setAltEtaMinutes] = useState<number | null>(null);
const [altDistKm, setAltDistKm] = useState<number | null>(null);
const [altSteps, setAltSteps] = useState<ManeuverStep[]>([]);
const [activeRoute, setActiveRoute] = useState<'primary' | 'alternative'>('primary');
```

In `fetchDirections`:
- Parse `data.alternatives` array (if present and non-empty).
- Decode alternative polyline, extract alt ETA/distance/steps.
- Set alt state.

Derived values passed to UI:
- If `activeRoute === 'primary'`: use `routeCoords`, `etaMinutes`, `distKm`, `steps`.
- If `activeRoute === 'alternative'`: use their `alt*` counterparts.
- `alternativeRouteLine={activeRoute === 'primary' ? altRouteCoords : routeCoords}`

`onToggle`:
```ts
setActiveRoute(prev => prev === 'primary' ? 'alternative' : 'primary');
```

Pill visibility: `altRouteCoords.length > 0`.

### `apps/mobile/src/screens/TripInProgressScreen.tsx`

Identical changes to NavigationScreen (same pattern: state, fetchDirections, derived values, pill).

### `apps/mobile/src/components/MapView.tsx`

New prop: `alternativeRouteLine?: Array<[number, number]>`.

In the WebView HTML/JS:
- New GeoJSON source: `route-line-alt` with `type: 'geojson'`, `data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }`.
- New layer: `route-line-layer-alt` with paint properties:
  - `line-color`: `#FFB020` (ámbar)
  - `line-width`: 3
  - `line-opacity`: 0.6
  - `line-dasharray`: `[2, 2]`
- Source ID: `route-line-alt`, below the primary route layer.

New message type `alternativeRoute` in the message handler:
```ts
case 'alternativeRoute':
  applyAlternativeRoute(message.coordinates);
  break;
case 'hideAlternativeRoute':
  clearAlternativeRoute();
  break;
```

- `applyAlternativeRoute(coordinates)`: updates the GeoJSON source with new coordinates.
- `clearAlternativeRoute()`: sets source data to empty LineString.
- `fitRoute` continues to fit only the primary (active) route.

## Error Handling

- If alternative polyline decoding fails → log warning, set `altRouteCoords = []`, pill hidden.
- If alternative has missing fields → treat as if no alternative, pill hidden.
- Backend OSRM failure → current error response unchanged, no alternatives.

## Testing

### Backend
- `maps.test.ts`: mock OSRM returning 2 routes, assert response includes `alternatives[0]` with correct fields.
- `maps.test.ts`: mock OSRM returning 1 route, assert `alternatives: []`.
- `maps.test.ts`: existing tests updated for new response shape.

### Mobile
- Unit test `AlternativeRoutePill`: renders correctly with time delta, hidden when `visible=false`, fires `onToggle` on press.
- Integration: NavigationScreen and TripInProgressScreen receive alternatives in mock API response, render pill, and toggle routes correctly.

## Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/shared/lib/geo.ts` | Expand `DirectionsResult`, return top 2 routes |
| `apps/backend/src/features/maps/maps.test.ts` | Update mocks & add alternative tests |
| `apps/mobile/src/api/types.ts` | Add `directionsResponseSchema` |
| `apps/mobile/src/components/AlternativeRoutePill.tsx` | **NEW** — pill component |
| `apps/mobile/src/screens/NavigationScreen.tsx` | Dual route state, pill toggle |
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | Dual route state, pill toggle |
| `apps/mobile/src/components/MapView.tsx` | `alternativeRouteLine` prop, second GeoJSON layer |
