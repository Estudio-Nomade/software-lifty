# Driver Location Marker on Map — Design Spec

**Date:** 2026-08-03  
**Status:** Approved  
**Scope:** Mobile only (consume backend broadcast from previous spec)

## Problem

El backend ya transmite `driver:location` al canal `trip:{tripId}` de Supabase Realtime. El mobile aún no escucha ese evento ni muestra el marcador del conductor en el mapa durante `NavigationScreen` (rumbo al pickup) ni `TripInProgressScreen` (rumbo al destino).

## Solution

Agregar callback `onDriverLocation` a `subscribeToTripChannel` y usarlo en ambas pantallas para mostrar un marker azul del conductor en tiempo real.

### Arquitectura

```
Backend → POST /realtime/v1/api/broadcast
              topic: trip:{tripId}
              event: driver:location
              payload: {lat, lng, heading, driver_id, timestamp}
                                   │
                                   ▼
supabase.channel('trip:{tripId}')
    .on('broadcast', {event: 'driver:location'}, callback)
                                   │
                                   ▼
onDriverLocation({lat, lng, heading}) → setDriverCoords([lng, lat])
                                   │
                                   ▼
MapView markers={[..., {id:'driver-location', coordinate, color:'#3182CE'}]}
```

### Files

| File | Action | Description |
|---|---|---|
| `src/lib/realtime.ts` | Modify | Add `onDriverLocation?` callback type and listener for `driver:location` |
| `src/screens/NavigationScreen.tsx` | Modify | Subscribe on mount, add driver marker to MapView |
| `src/screens/TripInProgressScreen.tsx` | Modify | Same |

### realtime.ts changes

Add to callbacks interface:
```ts
onDriverLocation?: (location: {
  lat: number;
  lng: number;
  heading?: number;
  driver_id: string;
  timestamp: string;
}) => void;
```

Add listener:
```ts
if (callbacks.onDriverLocation) {
  channel.on('broadcast', { event: 'driver:location' }, ({ payload }) => {
    callbacks.onDriverLocation?.(payload);
  });
}
```

### Screen changes (both)

- Import `subscribeToTripChannel` and `useTripStore`
- State: `const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null)`
- `useEffect` on mount: subscribe with `onDriverLocation` callback, cleanup returns unsubscribe
- Marker in MapView:
```ts
{ id: 'driver-location', coordinate: driverCoords, color: '#3182CE' }
```
Added only when `driverCoords` is not null.

Marker color: `#3182CE` (blue, distinct from pickup red `#FF6B6B`).

### Edge Cases

- **No location yet**: driverCoords is null → marker not rendered
- **Trip completed/cancelled**: channel unsubscribes on unmount (useEffect cleanup)
- **Network latency**: marker updates as soon as broadcast arrives, no polling
