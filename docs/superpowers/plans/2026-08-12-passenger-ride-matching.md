# Passenger Ride Request → Driver Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire passenger "SOLICITAR" end-to-end: request a ride with real coordinates, show a "Conectando con el conductor" screen that waits via Supabase Realtime for a driver to claim the trip, then land on trip-in-progress with real driver data.

**Architecture:** The backend already matches drivers (`claimTrip`) and broadcasts to the passenger (`broadcastToPassenger` → `trip:status` on `passenger:<id>`). The frontend needs: coordinates on autocomplete, a corrected request API, a realtime subscription, a "connecting" screen, and real trip data on the in-progress screen.

**Tech Stack:** Bun + Elysia (backend), Expo SDK 54 / React Native 0.81 / Zustand 5 / Supabase Realtime (passenger app).

## Global Constraints

- All UI uses `theme.*` tokens; no hardcoded colors/sizes. Named exports only; `StyleSheet.create()` at bottom.
- Relative imports (no `@/` alias). Touch targets ≥ 44px.
- Copy (exact): `Conectando con el conductor...`, `No hay conductores disponibles cerca`, `Cancelar`, `Tu conductor viene en camino`.
- Conventional commits, scope `passenger` (frontend) / `backend`.
- Commands (bun): backend test `bun --filter @lifty/backend test`; passenger test `bun --filter @lifty/mobile-passengers test`; typecheck `bun --filter @lifty/mobile-passengers typecheck`.
- Backend geocoder is Photon (`PHOTON_URL`); `geo.ts` autocomplete returns `PlaceResult[]`.

---

### Task 1: Backend autocomplete returns coordinates

**Files:**
- Modify: `apps/backend/src/shared/lib/geo.ts`
- Modify: `apps/backend/src/features/maps/maps.test.ts`

**Interfaces:**
- Produces: `PlaceResult` gains `lat: number; lng: number`. `autocomplete(input, lat?, lng?)` returns them (Photon `geometry.coordinates` is `[lng, lat]`).

- [ ] **Step 1: Update the failing test assertion**

In `apps/backend/src/features/maps/maps.test.ts`, inside the `autocomplete returns places` test (after line 86 `expect(data[0].place_id).toBeString();`), add:

```ts
    expect(data[0].lat).toBeNumber();
    expect(data[0].lng).toBeNumber();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun --filter @lifty/backend test src/features/maps/maps.test.ts`
Expected: FAIL — `expect(data[0].lat).toBeNumber()` receives `undefined`.

- [ ] **Step 3: Add lat/lng to `PlaceResult` and the autocomplete mapping**

In `apps/backend/src/shared/lib/geo.ts`:

Change the interface:
```ts
export interface PlaceResult {
  description: string;
  place_id: string;
  lat: number;
  lng: number;
}
```

Change the test-mode mock in `autocomplete` (lines ~142-147):
```ts
    if (process.env.NODE_ENV === 'test') {
      return [
        { description: `${input}, Buenos Aires, Argentina`, place_id: 'mock-1', lat: -34.6037, lng: -58.3816 },
        { description: `${input}, Mendoza, Argentina`, place_id: 'mock-2', lat: -32.8908, lng: -68.8272 },
      ];
    }
```

Change the real mapping (lines ~160-163):
```ts
    return (data.features || []).map((f) => ({
      description: formatPhotonAddress(f.properties),
      place_id: String(f.properties.osm_id),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --filter @lifty/backend test src/features/maps/maps.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Typecheck + commit**

Run: `bun --filter @lifty/backend typecheck` (exit 0)

```bash
git add apps/backend/src/shared/lib/geo.ts apps/backend/src/features/maps/maps.test.ts
git commit -m "feat(backend): return coordinates from address autocomplete"
```

---

### Task 2: Frontend API types + requestRide + directions/geocode helpers

**Files:**
- Modify: `apps/mobile-passengers/src/api/types.ts`
- Modify: `apps/mobile-passengers/src/api/passenger.ts`

**Interfaces:**
- Produces:
  - `PlaceSuggestion { place_id: string; description: string; lat: number; lng: number }`
  - `Trip` matching backend columns + joined driver/vehicle fields.
  - `TripStatus` matching backend statuses.
  - `requestRide(params) => Promise<Trip>` (new body shape).
  - `getDirections(params) => Promise<{ distance_km: number; duration_minutes: number }>`.
  - `geocodeAddress(address) => Promise<{ lat: number; lng: number; formatted_address: string }>`.

- [ ] **Step 1: Rewrite `types.ts`**

Replace the contents of `apps/mobile-passengers/src/api/types.ts`:

```ts
export interface PassengerProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
}

export type TripStatus =
  | 'pending'
  | 'offered'
  | 'request_received'
  | 'accepted'
  | 'en_route'
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'cancelled_early'
  | 'cancelled_late'
  | 'rejected'
  | 'expired'
  | 'rated';

export interface Trip {
  id: string;
  passenger_id: string;
  driver_id?: string | null;
  status: TripStatus;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  origin_address?: string | null;
  dest_address?: string | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
  total_fare?: number | null;
  verification_code?: string | null;
  driver_name?: string | null;
  driver_avatar_url?: string | null;
  driver_rating?: number | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_plate?: string | null;
  driver_lat?: number | null;
  driver_lng?: number | null;
  created_at: string;
  updated_at: string;
}

export interface FareEstimate {
  fare: number;
  distance_km: number;
  duration_min: number;
  vehicle_type: 'auto' | 'moto';
}

export interface PlaceSuggestion {
  place_id: string;
  description: string;
  lat: number;
  lng: number;
}

export interface ApiError {
  error: string;
  message?: string;
}
```

- [ ] **Step 2: Rewrite `requestRide` and add helpers in `passenger.ts`**

In `apps/mobile-passengers/src/api/passenger.ts`, replace the `requestRide` function (current lines 29-41) with:

```ts
export async function requestRide(params: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  origin_address: string;
  dest_address: string;
  vehicle_type: 'auto' | 'moto';
  distance_km: number;
  duration_minutes: number;
}): Promise<Trip> {
  const { data } = await api.post<Trip>('/passenger/trips/request', params);
  return data;
}

export async function getDirections(params: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
}): Promise<{ distance_km: number; duration_minutes: number }> {
  const { data } = await api.get<{ distance_km: number; duration_minutes: number }>(
    '/maps/directions',
    { params },
  );
  return data;
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  formatted_address: string;
}> {
  const { data } = await api.get<{ lat: number; lng: number; formatted_address: string }>(
    '/maps/geocode',
    { params: { address } },
  );
  return data;
}
```

Leave `getActiveRide`, `getRideHistory`, `getRideDetails`, `cancelRide`, `rateRide`, `searchPlaces`, `registerPassenger`, `getProfile`, `updateProfile`, `estimateFare` unchanged (they now typecheck against the corrected `Trip`).

- [ ] **Step 3: Typecheck (verification — this is a type/wiring change, no runtime unit test)**

Run: `bun --filter @lifty/mobile-passengers typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile-passengers/src/api/types.ts apps/mobile-passengers/src/api/passenger.ts
git commit -m "feat(passenger): align trip types and request API with backend schema"
```

---

### Task 3: Passenger realtime lib + ConnectingDriver route

**Files:**
- Create: `apps/mobile-passengers/src/lib/realtime.ts`
- Modify: `apps/mobile-passengers/src/hooks/useAppNavigation.ts`

**Interfaces:**
- Produces: `subscribeToPassengerChannel(passengerId: string, onTripStatus: (trip: any) => void): () => void`.
- Produces: `ConnectingDriver: '/connecting-driver'` in `SCREEN_TO_ROUTE` (auto-adds `ConnectingDriver` to `ScreenName`).

- [ ] **Step 1: Create the realtime lib**

`apps/mobile-passengers/src/lib/realtime.ts`:

```ts
import { supabase } from './supabase';

export function subscribeToPassengerChannel(
  passengerId: string,
  onTripStatus: (trip: any) => void,
): () => void {
  const channel = supabase.channel(`passenger:${passengerId}`);

  channel.on('broadcast', { event: 'trip:status' }, ({ payload }) => {
    onTripStatus(payload);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 2: Add the route mapping**

In `apps/mobile-passengers/src/hooks/useAppNavigation.ts`, add to `SCREEN_TO_ROUTE` (after `TripInProgress: '/trip-in-progress',`):

```ts
  ConnectingDriver: '/connecting-driver',
```

- [ ] **Step 3: Typecheck**

Run: `bun --filter @lifty/mobile-passengers typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile-passengers/src/lib/realtime.ts apps/mobile-passengers/src/hooks/useAppNavigation.ts
git commit -m "feat(passenger): add passenger realtime subscription and connecting route"
```

---

### Task 4: HomeScreen passes coordinates to VehicleSelect

**Files:**
- Modify: `apps/mobile-passengers/src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `geocodeAddress` (Task 2), `PlaceSuggestion` (now with `lat`/`lng`), `current` from `useLocation()`.
- Produces: navigates to `VehicleSelect` with params `pickup`, `destination`, `pickupLat`, `pickupLng`, `destLat`, `destLng` (all strings).

- [ ] **Step 1: Add dest-coordinate state**

In `apps/mobile-passengers/src/screens/HomeScreen.tsx`, add after the `recenterKey` state (line ~33):

```ts
  const [destCoord, setDestCoord] = useState<{ lat: number; lng: number } | null>(null);
```

Add the import for `geocodeAddress` (extend the existing `../api/passenger` import or add a new one):

```ts
import { geocodeAddress } from '../api/passenger';
```

- [ ] **Step 2: Store coords on suggestion select and clear on chip select**

Replace `handleChipSelect` and `handleSelectSuggestion` (lines ~77-83) with:

```ts
  const handleChipSelect = (address: string) => {
    setDestAddress(address);
    setDestCoord(null);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    setDestAddress(suggestion.description);
    setDestCoord({ lat: suggestion.lat, lng: suggestion.lng });
  };
```

- [ ] **Step 3: Rewrite `handleConfirmDestination` to pass coordinates (with geocode fallback)**

Replace `handleConfirmDestination` (lines ~85-92) with:

```ts
  const handleConfirmDestination = async () => {
    const dest = destAddress.trim();
    if (!dest) return;
    Keyboard.dismiss();

    let resolvedDest = destCoord;
    if (!resolvedDest) {
      try {
        const g = await geocodeAddress(dest);
        resolvedDest = { lat: g.lat, lng: g.lng };
      } catch {
        resolvedDest = null;
      }
    }

    navigate('VehicleSelect', {
      pickup: pickupAddress,
      destination: dest,
      pickupLat: current ? String(current.lat) : '',
      pickupLng: current ? String(current.lng) : '',
      destLat: resolvedDest ? String(resolvedDest.lat) : '',
      destLng: resolvedDest ? String(resolvedDest.lng) : '',
    });
  };
```

- [ ] **Step 4: Typecheck + lint**

Run: `bun --filter @lifty/mobile-passengers typecheck` (exit 0)
Run: `bun --filter @lifty/mobile-passengers lint` (no errors)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-passengers/src/screens/HomeScreen.tsx
git commit -m "feat(passenger): pass destination and pickup coordinates to vehicle select"
```

---

### Task 5: VehicleSelect requests the ride on SOLICITAR

**Files:**
- Modify: `apps/mobile-passengers/src/screens/VehicleSelectScreen.tsx`

**Interfaces:**
- Consumes: `getDirections`, `requestRide` (Task 2), route params `pickup`, `destination`, `pickupLat`, `pickupLng`, `destLat`, `destLng`, `selected` (`'auto' | 'moto'`).
- Produces: on success navigates to `ConnectingDriver` with `{ tripId }`.

- [ ] **Step 1: Add imports and state**

In `apps/mobile-passengers/src/screens/VehicleSelectScreen.tsx`, add `Alert` to the existing `react-native` import (currently `import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';` → add `Alert`), and add:

```ts
import { getDirections, requestRide } from '../api/passenger';
```

Add `loading` state after `selected`:

```ts
  const [loading, setLoading] = useState(false);
```

Extend the params destructure to read the coordinate params (replace the existing `useLocalSearchParams` line):

```ts
  const { pickup, destination, pickupLat, pickupLng, destLat, destLng } =
    useLocalSearchParams<{
      pickup?: string;
      destination?: string;
      pickupLat?: string;
      pickupLng?: string;
      destLat?: string;
      destLng?: string;
    }>();
```

- [ ] **Step 2: Add the request handler**

Add after the state declarations:

```ts
  const handleRequest = async () => {
    const originLat = Number(pickupLat);
    const originLng = Number(pickupLng);
    const destLatNum = Number(destLat);
    const destLngNum = Number(destLng);

    if (
      Number.isNaN(originLat) ||
      Number.isNaN(originLng) ||
      Number.isNaN(destLatNum) ||
      Number.isNaN(destLngNum)
    ) {
      Alert.alert('Ubicación no disponible', 'No pudimos obtener tu ubicación. Reintentá.');
      return;
    }

    setLoading(true);
    try {
      const dir = await getDirections({
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLatNum,
        dest_lng: destLngNum,
      });

      const trip = await requestRide({
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLatNum,
        dest_lng: destLngNum,
        origin_address: pickup || '',
        dest_address: destination || '',
        vehicle_type: selected,
        distance_km: dir.distance_km,
        duration_minutes: dir.duration_minutes,
      });

      navigate('ConnectingDriver', { tripId: trip.id });
    } catch {
      Alert.alert('No se pudo solicitar el viaje', 'Intentalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Wire the SOLICITAR button**

Replace the `Button` (the one with `variant="cta"` / `SOLICITAR ...`) `onPress` and add `loading`:

```tsx
          <Button
            variant="cta"
            onPress={handleRequest}
            loading={loading}
            style={styles.solicitarBtn}
          >
            SOLICITAR {VEHICLES.find((v) => v.id === selected)?.price}
          </Button>
```

- [ ] **Step 4: Typecheck + lint**

Run: `bun --filter @lifty/mobile-passengers typecheck` (exit 0)
Run: `bun --filter @lifty/mobile-passengers lint` (no errors)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-passengers/src/screens/VehicleSelectScreen.tsx
git commit -m "feat(passenger): request ride and navigate to connecting screen on solicitar"
```

---

### Task 6: ConnectingDriver screen

**Files:**
- Create: `apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx`
- Create: `apps/mobile-passengers/app/connecting-driver.tsx`
- Test: `apps/mobile-passengers/src/__tests__/screens/ConnectingDriver.test.tsx`

**Interfaces:**
- Consumes: `subscribeToPassengerChannel` (Task 3), `getRideDetails`, `cancelRide` (Task 2), `useAuthStore`, `useRideStore`, `useAppNavigation` (`navigate`, `replace`), `useLocalSearchParams` (`tripId`).
- Produces: `export function ConnectingDriverScreen()`; route `app/connecting-driver.tsx`.

- [ ] **Step 1: Write the failing test**

`apps/mobile-passengers/src/__tests__/screens/ConnectingDriver.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ConnectingDriverScreen } from '../../screens/ConnectingDriverScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tripId: 'trip-123' }),
}));

jest.mock('../../lib/realtime', () => ({
  subscribeToPassengerChannel: jest.fn(() => () => {}),
}));

const mockReplace = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../api/passenger', () => ({
  getRideDetails: jest.fn(),
  cancelRide: jest.fn(),
}));

describe('ConnectingDriverScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows searching state initially', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    expect(getByText('Conectando con el conductor...')).toBeTruthy();
  });

  test('shows no-driver message after 30s timeout', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    jest.advanceTimersByTime(30_000);
    expect(getByText('No hay conductores disponibles cerca')).toBeTruthy();
  });

  test('cancel calls cancelRide and replaces to home', async () => {
    const { cancelRide } = require('../../api/passenger');
    const { getByText } = await render(<ConnectingDriverScreen />);
    fireEvent.press(getByText('Cancelar'));
    expect(cancelRide).toHaveBeenCalledWith('trip-123');
    expect(mockReplace).toHaveBeenCalledWith('Home');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @lifty/mobile-passengers test ConnectingDriver`
Expected: FAIL — `Cannot find module '../../screens/ConnectingDriverScreen'`.

- [ ] **Step 3: Create the screen**

`apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { cancelRide, getRideDetails } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

const SEARCH_TIMEOUT_MS = 30_000;

export function ConnectingDriverScreen() {
  const { navigate, replace } = useAppNavigation();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const userId = useAuthStore((s) => s.userId);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (userId) {
      unsubscribe = subscribeToPassengerChannel(userId, async (trip: any) => {
        if (!tripId || trip?.id !== tripId || !trip?.driver_id) return;
        const full = await getRideDetails(tripId).catch(() => null);
        setActiveTrip(full ?? trip);
        replace('TripInProgress');
      });
    }

    const timeout = setTimeout(() => setTimedOut(true), SEARCH_TIMEOUT_MS);

    return () => {
      unsubscribe?.();
      clearTimeout(timeout);
    };
  }, [userId, tripId, setActiveTrip, replace]);

  const handleCancel = async () => {
    if (tripId) {
      await cancelRide(tripId).catch(() => {});
    }
    replace('Home');
  };

  if (timedOut) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>No hay conductores disponibles cerca</Text>
          <Text style={styles.subtitle}>Intentá de nuevo en unos minutos.</Text>
          <Button variant="primary" onPress={handleCancel} style={styles.button}>
            Cancelar
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.title}>Conectando con el conductor...</Text>
        <Text style={styles.subtitle}>Buscando el conductor más cercano</Text>
        <Button variant="secondary" onPress={handleCancel} style={styles.button}>
          Cancelar
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  button: { marginTop: theme.spacing.md, minWidth: 200 },
});
```

- [ ] **Step 4: Create the route re-export**

`apps/mobile-passengers/app/connecting-driver.tsx`:

```tsx
export { ConnectingDriverScreen as default } from '../src/screens/ConnectingDriverScreen';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun --filter @lifty/mobile-passengers test ConnectingDriver`
Expected: PASS — 3 tests.

- [ ] **Step 6: Typecheck + commit**

Run: `bun --filter @lifty/mobile-passengers typecheck` (exit 0)

```bash
git add apps/mobile-passengers/src/screens/ConnectingDriverScreen.tsx apps/mobile-passengers/app/connecting-driver.tsx apps/mobile-passengers/src/__tests__/screens/ConnectingDriver.test.tsx
git commit -m "feat(passenger): add connecting-to-driver screen with realtime and timeout"
```

---

### Task 7: TripInProgress shows real trip data

**Files:**
- Modify: `apps/mobile-passengers/src/screens/TripInProgressScreen.tsx`
- Test: `apps/mobile-passengers/src/__tests__/screens/TripInProgress.test.tsx`

**Interfaces:**
- Consumes: `useRideStore` (`activeTrip`, `setActiveTrip`), `getActiveRide` (Task 2), `PassengerMap`, `useLocationStore`.
- Produces: `TripInProgressScreen` renders driver name/rating/vehicle from the active trip.

- [ ] **Step 1: Write the failing test**

`apps/mobile-passengers/src/__tests__/screens/TripInProgress.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import React from 'react';
import { TripInProgressScreen } from '../../screens/TripInProgressScreen';
import { useRideStore } from '../../store/rideStore';

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
}));

describe('TripInProgressScreen', () => {
  beforeEach(() => {
    useRideStore.setState({ activeTrip: null });
  });

  test('renders real driver name and vehicle from the active trip', async () => {
    useRideStore.getState().setActiveTrip({
      id: 'trip-1',
      passenger_id: 'p-1',
      status: 'accepted',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      driver_rating: 4.9,
      vehicle_brand: 'Toyota',
      vehicle_model: 'Etios',
      vehicle_plate: 'AB 123 CD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { getByText } = await render(<TripInProgressScreen />);
    expect(getByText('María López')).toBeTruthy();
    expect(getByText('⭐ 4.9')).toBeTruthy();
    expect(getByText('Toyota Etios')).toBeTruthy();
    expect(getByText('AB 123 CD')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --filter @lifty/mobile-passengers test TripInProgress`
Expected: FAIL — the current screen renders hardcoded "Juan Pérez" (no "María López").

- [ ] **Step 3: Rewrite `TripInProgressScreen.tsx`**

Replace the full contents of `apps/mobile-passengers/src/screens/TripInProgressScreen.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { getActiveRide } from '../api/passenger';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocationStore } from '../store/locationStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export function TripInProgressScreen() {
  const { navigate } = useAppNavigation();
  const current = useLocationStore((s) => s.current);
  const activeTrip = useRideStore((s) => s.activeTrip);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);

  useEffect(() => {
    if (activeTrip) return;
    getActiveRide()
      .then((t) => {
        if (t) setActiveTrip(t);
      })
      .catch(() => {});
  }, [activeTrip, setActiveTrip]);

  const trip = activeTrip;
  const driverCoord: [number, number] | null =
    trip?.driver_lat != null && trip?.driver_lng != null
      ? [trip.driver_lng, trip.driver_lat]
      : null;

  const vehicleLabel =
    [trip?.vehicle_brand, trip?.vehicle_model].filter(Boolean).join(' ') || 'Vehículo';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapArea}>
        <PassengerMap
          centerCoordinate={
            driverCoord ?? (current ? [current.lng, current.lat] : [-58.3816, -34.6037])
          }
          userLocation={driverCoord}
          followUserLocation={false}
          style={styles.mapFill}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Ionicons name="person" size={28} color={theme.colors.mediumGray} />
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.statusText}>Tu conductor viene en camino</Text>
            <Text style={styles.driverName}>{trip?.driver_name ?? 'Tu conductor'}</Text>
            <View style={styles.vehicleRow}>
              {trip?.driver_rating != null ? (
                <Text style={styles.vehicleDetail}>⭐ {trip.driver_rating}</Text>
              ) : null}
              <Text style={styles.vehicleDetail}>{vehicleLabel}</Text>
              {trip?.vehicle_plate ? (
                <Text style={styles.vehicleDetail}>{trip.vehicle_plate}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => navigate('Chat')} style={styles.actionBtn}>
            💬 Chat
          </Button>
          <Button variant="secondary" onPress={() => {}} style={styles.actionBtn}>
            📞 Llamar
          </Button>
        </View>

        <Button variant="danger" onPress={() => navigate('Home')} style={styles.cancelBtn}>
          CANCELAR VIAJE
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  mapArea: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  mapFill: {
    flex: 1,
  },
  content: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  driverCard: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfo: { flex: 1, gap: 2 },
  statusText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  driverName: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  vehicleRow: { flexDirection: 'row', gap: theme.spacing.sm },
  vehicleDetail: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { flex: 1 },
  cancelBtn: { width: '100%' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --filter @lifty/mobile-passengers test TripInProgress`
Expected: PASS — 1 test.

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `bun --filter @lifty/mobile-passengers typecheck` (exit 0)
Run: `bun --filter @lifty/mobile-passengers test` (all suites pass)

```bash
git add apps/mobile-passengers/src/screens/TripInProgressScreen.tsx apps/mobile-passengers/src/__tests__/screens/TripInProgress.test.tsx
git commit -m "feat(passenger): show real driver and vehicle in trip-in-progress"
```

---

## Verification (final)

- [ ] `bun --filter @lifty/backend test` → all pass.
- [ ] `bun --filter @lifty/mobile-passengers test` → all pass.
- [ ] `bun --filter @lifty/mobile-passengers typecheck` → exit 0.
- [ ] Manual smoke: type destination → select suggestion → SOLICITAR → "Conectando..." → (driver claims in driver app) → trip-in-progress with real driver.
