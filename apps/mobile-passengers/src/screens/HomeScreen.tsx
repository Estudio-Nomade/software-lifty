import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { geocodeAddress, getActiveRide } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { BottomTabBar } from '../components/BottomTabBar';
import { HomeHeader } from '../components/HomeHeader';
import { PassengerMap } from '../components/Map/PassengerMap';
import { DestinationSearchPill } from '../components/home/DestinationSearchPill';
import { ExpandedTripSearch } from '../components/home/ExpandedTripSearch';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  TARGET_ACCURACY_M,
  requestFreshPosition,
  toMapCoordinate,
  useLocation,
} from '../hooks/useLocation';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';
import { resolveAddressLabel } from '../utils/resolveAddressLabel';

/** Rough meters between two WGS84 points (good enough for GPS refine). */
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function HomeScreen() {
  const { navigate, replace } = useAppNavigation();
  const { current, locationError, refresh } = useLocation();
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const trip = await getActiveRide().catch(() => null);
        if (cancelled || !trip) return;
        if (trip.status === 'pending' || trip.status === 'offered') {
          replace('ConnectingDriver', { tripId: trip.id });
          return;
        }
        if (['accepted', 'en_route', 'waiting', 'in_trip'].includes(trip.status)) {
          setActiveTrip(trip);
          replace('TripInProgress');
        }
        if (trip.status === 'completed') {
          setActiveTrip(trip);
          replace('TripComplete');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [replace, setActiveTrip]),
  );

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [recenterKey, setRecenterKey] = useState(0);
  const [pickupCoord, setPickupCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoord, setDestCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [focusedField, setFocusedField] = useState<'pickup' | 'dest' | null>('dest');
  const [pickupPicked, setPickupPicked] = useState(false);
  const [destPicked, setDestPicked] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  /** True while "Desde" still tracks live GPS (not user-edited). */
  const [pickupFromGps, setPickupFromGps] = useState(false);
  const [pickupLoading, setPickupLoading] = useState(false);
  const lastGpsLabel = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  const pickupAc = usePlaceAutocomplete(
    focusedField === 'pickup' && !pickupPicked ? pickupAddress : '',
  );
  const destAc = usePlaceAutocomplete(focusedField === 'dest' && !destPicked ? destAddress : '');
  const visibleSuggestions = focusedField === 'pickup' ? pickupAc.suggestions : destAc.suggestions;
  const placesLoading = focusedField === 'pickup' ? pickupAc.loading : destAc.loading;
  const placesError = focusedField === 'pickup' ? pickupAc.error : destAc.error;

  // "Desde" autofill: wait for best GPS (not first coarse WiFi), then label.
  useEffect(() => {
    if (!searchExpanded) return;
    if (pickupPicked || pickupAddress.trim()) return;
    let cancelled = false;
    setPickupLoading(true);
    (async () => {
      const fix = await requestFreshPosition();
      if (cancelled) return;
      if (!fix) {
        setPickupLoading(false);
        return;
      }

      const acc = fix.accuracy ?? Number.POSITIVE_INFINITY;
      setPickupCoord({ lat: fix.lat, lng: fix.lng });
      // Coarse WiFi/IP must not freeze a wrong street name.
      const label = await resolveAddressLabel(fix.lat, fix.lng, { accuracy: acc });
      if (cancelled) return;
      setPickupAddress(label);
      setPickupPicked(true);
      setPickupFromGps(true);
      setPickupLoading(false);
      lastGpsLabel.current = { lat: fix.lat, lng: fix.lng, acc };
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit `current` — requestFreshPosition owns the wait.
  }, [searchExpanded, pickupPicked, pickupAddress]);

  // Refine "Desde" when GPS warm-up yields a much better / moved fix.
  useEffect(() => {
    if (!searchExpanded || !pickupFromGps || !current) return;
    const prev = lastGpsLabel.current;
    if (!prev) return;
    const acc = current.accuracy ?? Number.POSITIVE_INFINITY;
    const moved = metersBetween(prev, current);
    const muchBetter = acc <= TARGET_ACCURACY_M && acc < prev.acc * 0.5;
    const jumped = moved > 45 && acc <= Math.max(prev.acc, 80);
    if (!muchBetter && !jumped) return;

    let cancelled = false;
    (async () => {
      const label = await resolveAddressLabel(current.lat, current.lng, { accuracy: acc });
      if (cancelled) return;
      setPickupCoord({ lat: current.lat, lng: current.lng });
      setPickupAddress(label);
      lastGpsLabel.current = { lat: current.lat, lng: current.lng, acc };
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.lat, current?.lng, current?.accuracy, searchExpanded, pickupFromGps]);

  const handleLocate = () => {
    void (typeof refresh === 'function' ? refresh() : requestFreshPosition()).finally(() => {
      setRecenterKey((k) => k + 1);
    });
  };

  const handleOpenSearch = () => {
    setSearchError(null);
    setSearchExpanded(true);
  };

  const handleCloseSearch = () => {
    Keyboard.dismiss();
    setSearchExpanded(false);
    setDestAddress('');
    setDestCoord(null);
    setPickupPicked(false);
    setDestPicked(false);
    setPickupFromGps(false);
    setPickupLoading(false);
    lastGpsLabel.current = null;
    setFocusedField('dest');
    setSearchError(null);
  };

  const handleChipSelect = (selection: { address: string; lat?: number; lng?: number }) => {
    setDestAddress(selection.address);
    setDestCoord(
      selection.lat != null && selection.lng != null
        ? { lat: selection.lat, lng: selection.lng }
        : null,
    );
    setDestPicked(true);
    setFocusedField(null);
    Keyboard.dismiss();
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    if (focusedField === 'pickup') {
      setPickupAddress(suggestion.description);
      setPickupCoord({ lat: suggestion.lat, lng: suggestion.lng });
      setPickupPicked(true);
      setPickupFromGps(false);
      setPickupLoading(false);
    } else {
      setDestAddress(suggestion.description);
      setDestCoord({ lat: suggestion.lat, lng: suggestion.lng });
      setDestPicked(true);
    }
    setFocusedField(null);
    Keyboard.dismiss();
  };

  const handleUseMyLocation = () => {
    void (async () => {
      setPickupLoading(true);
      setSearchError(null);
      const fix = await requestFreshPosition();
      if (!fix) {
        setPickupLoading(false);
        return;
      }
      const acc = fix.accuracy ?? Number.POSITIVE_INFINITY;
      const label = await resolveAddressLabel(fix.lat, fix.lng, { accuracy: acc });
      setPickupCoord({ lat: fix.lat, lng: fix.lng });
      setPickupAddress(label);
      setPickupPicked(true);
      setPickupFromGps(true);
      setPickupLoading(false);
      lastGpsLabel.current = { lat: fix.lat, lng: fix.lng, acc };
      setFocusedField('dest');
      Keyboard.dismiss();
    })();
  };

  const clearPickup = () => {
    setPickupAddress('');
    setPickupCoord(null);
    setPickupPicked(false);
    setPickupFromGps(false);
    setPickupLoading(false);
    setFocusedField('pickup');
  };

  const clearDest = () => {
    setDestAddress('');
    setDestCoord(null);
    setDestPicked(false);
    setFocusedField('dest');
  };

  const handleConfirmDestination = async () => {
    const dest = destAddress.trim();
    if (!dest) return;
    Keyboard.dismiss();
    setSearchError(null);

    let resolvedPickup = pickupCoord;
    if (!resolvedPickup && pickupAddress.trim()) {
      try {
        const g = await geocodeAddress(pickupAddress.trim());
        resolvedPickup = { lat: g.lat, lng: g.lng };
      } catch {
        resolvedPickup = null;
      }
    }
    if (!resolvedPickup && current) {
      resolvedPickup = { lat: current.lat, lng: current.lng };
    }

    let resolvedDest = destCoord;
    if (!resolvedDest) {
      try {
        const g = await geocodeAddress(dest);
        resolvedDest = { lat: g.lat, lng: g.lng };
      } catch {
        resolvedDest = null;
      }
    }

    if (!resolvedPickup || !resolvedDest) {
      setSearchError('No encontramos esa dirección. Revisá la dirección e intentá de nuevo.');
      return;
    }

    navigate('VehicleSelect', {
      pickup: pickupAddress,
      destination: dest,
      pickupLat: String(resolvedPickup.lat),
      pickupLng: String(resolvedPickup.lng),
      destLat: String(resolvedDest.lat),
      destLng: String(resolvedDest.lng),
    });
  };

  const showUseMyLocation =
    focusedField === 'pickup' || (!pickupAddress.trim() && !pickupLoading && !pickupPicked);

  const searchForm = (
    <ExpandedTripSearch
      pickupAddress={pickupAddress}
      destAddress={destAddress}
      focusedField={focusedField}
      pickupLoading={pickupLoading}
      suggestions={visibleSuggestions}
      placesLoading={placesLoading}
      placesError={placesError}
      searchError={searchError}
      showUseMyLocation={showUseMyLocation}
      onBack={handleCloseSearch}
      onPickupChange={(text) => {
        setPickupAddress(text);
        setPickupCoord(null);
        setPickupPicked(false);
        setPickupFromGps(false);
        setPickupLoading(false);
        setFocusedField('pickup');
        setSearchError(null);
      }}
      onDestChange={(text) => {
        setDestAddress(text);
        setDestCoord(null);
        setDestPicked(false);
        setFocusedField('dest');
        setSearchError(null);
      }}
      onPickupFocus={() => setFocusedField('pickup')}
      onDestFocus={() => setFocusedField('dest')}
      onClearPickup={clearPickup}
      onClearDest={clearDest}
      onSelectSuggestion={handleSelectSuggestion}
      onUseMyLocation={handleUseMyLocation}
      onChipSelect={handleChipSelect}
      onConfirm={handleConfirmDestination}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.bodyWrap}>
        {searchExpanded ? (
          <View style={styles.expandedSearch}>
            {/*
              Android: sin KeyboardAvoidingView (el SO ya hace resize; KAV deja hueco).
              ScrollView con padding extra para ver chips + CTA con teclado abierto.
            */}
            {Platform.OS === 'ios' ? (
              <KeyboardAvoidingView style={styles.expandedBody} behavior="padding">
                <ScrollView
                  style={styles.expandedBody}
                  contentContainerStyle={styles.expandedBodyContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  automaticallyAdjustKeyboardInsets
                  showsVerticalScrollIndicator={false}
                >
                  {searchForm}
                </ScrollView>
              </KeyboardAvoidingView>
            ) : (
              <ScrollView
                style={styles.expandedBody}
                contentContainerStyle={styles.expandedBodyContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                {searchForm}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.collapsed}>
            <HomeHeader />

            <View style={styles.mapArea}>
              <PassengerMap
                // [0,0] ignored until real GPS. Never pass a city default (BA bug).
                centerCoordinate={current ? toMapCoordinate(current.lat, current.lng) : [0, 0]}
                userLocation={current ? toMapCoordinate(current.lat, current.lng) : null}
                followUserLocation
                recenterKey={recenterKey}
                style={styles.mapFill}
              />
              {locationError && !current ? (
                <TouchableOpacity
                  style={styles.geoBanner}
                  onPress={handleLocate}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar ubicación"
                >
                  <Ionicons name="warning-outline" size={16} color={theme.colors.white} />
                  <Text style={styles.geoBannerText} numberOfLines={2}>
                    {locationError}
                  </Text>
                  <Text style={styles.geoBannerRetry}>Reintentar</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.locateBtn}
                onPress={handleLocate}
                activeOpacity={0.8}
                accessibilityLabel="Centrar ubicación"
              >
                <Ionicons name="locate-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetDock}>
              <DestinationSearchPill onPress={handleOpenSearch} />
            </View>
          </View>
        )}

        {!searchExpanded ? (
          <BottomTabBar activeTab="home" onSearchPress={handleOpenSearch} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  bodyWrap: {
    flex: 1,
  },
  collapsed: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  mapArea: {
    flex: 1,
    marginHorizontal: 0,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  mapFill: {
    flex: 1,
  },
  sheetDock: {
    backgroundColor: theme.colors.background,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    marginTop: -theme.radius.xl,
    ...theme.shadows.card,
  },
  locateBtn: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  geoBanner: {
    position: 'absolute',
    left: theme.spacing.sm,
    right: theme.spacing.sm,
    bottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.deepBlue,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  geoBannerText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.white,
  },
  geoBannerRetry: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  expandedSearch: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  expandedBody: {
    flex: 1,
  },
  expandedBodyContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
});
