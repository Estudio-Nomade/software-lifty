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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { geocodeAddress, getActiveRide, getProfile } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { BottomTabBar } from '../components/BottomTabBar';
import { HomeHeader } from '../components/HomeHeader';
import { PassengerMap } from '../components/Map/PassengerMap';
import { DestinationSearchPill } from '../components/home/DestinationSearchPill';
import { ExpandedTripSearch } from '../components/home/ExpandedTripSearch';
import { OutOfServiceAreaBanner } from '../components/home/OutOfServiceAreaBanner';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { requestFreshPosition, toMapCoordinate, useLocation } from '../hooks/useLocation';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { isPassengerHomeResolved } from '../lib/passengerProfileGate';
import {
  type ServiceAreaStatus,
  fetchServiceAreaStatus,
  shouldShowOutOfServiceBanner,
} from '../lib/serviceAreaStatus';
import { getTabBarReserve } from '../lib/tabBarLayout';
import { syncCasaFavoriteFromProfile } from '../store/favoritesStore';
import { useLocationStore } from '../store/locationStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';
import { MAX_LABEL_ACCURACY_M, resolveAddressLabel } from '../utils/resolveAddressLabel';

/** Re-reverse Origen when GPS moved this far from the labeled fix. */
const GPS_LABEL_REFINE_M = 20;

const LOCATION_UNAVAILABLE_MSG =
  'No pudimos obtener tu ubicación. Activá el GPS o permití el acceso e intentá de nuevo.';

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
  const insets = useSafeAreaInsets();
  const tabReserve = getTabBarReserve(insets.bottom);
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
  /**
   * When true, opening search may GPS-autofill Origen.
   * Clear / manual edit set false so ✕ stays empty until "Usar mi ubicación" or re-open.
   */
  const [pickupGpsAutofill, setPickupGpsAutofill] = useState(true);
  const lastGpsLabel = useRef<{ lat: number; lng: number; acc: number } | null>(null);
  /** Monotonic id so only the latest GPS fill (autofill or Usar ubicación) may write state. */
  const gpsFillIdRef = useRef(0);
  const [serviceArea, setServiceArea] = useState<ServiceAreaStatus | null>(null);
  const [oofDismissed, setOofDismissed] = useState(false);
  const prevServiceInsideRef = useRef<boolean | null>(null);

  const pickupAc = usePlaceAutocomplete(
    focusedField === 'pickup' && !pickupPicked ? pickupAddress : '',
  );
  const destAc = usePlaceAutocomplete(focusedField === 'dest' && !destPicked ? destAddress : '');
  const visibleSuggestions = focusedField === 'pickup' ? pickupAc.suggestions : destAc.suggestions;
  const placesLoading = focusedField === 'pickup' ? pickupAc.loading : destAc.loading;
  const placesError = focusedField === 'pickup' ? pickupAc.error : destAc.error;

  // Soft OOF banner: GPS preferred, else home pin from profile.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let status: ServiceAreaStatus | null = null;
      if (current && Number.isFinite(current.lat) && Number.isFinite(current.lng)) {
        status = await fetchServiceAreaStatus(current.lat, current.lng);
      } else {
        const profile = await getProfile().catch(() => null);
        if (cancelled || !profile) return;
        syncCasaFavoriteFromProfile(profile);
        if (!isPassengerHomeResolved(profile)) return;
        status = await fetchServiceAreaStatus(
          profile.home_lat as number,
          profile.home_lng as number,
        );
      }
      if (cancelled || !status) return;
      const prevInside = prevServiceInsideRef.current;
      if (prevInside !== null && prevInside !== status.inside) {
        setOofDismissed(false);
      }
      prevServiceInsideRef.current = status.inside;
      setServiceArea(status);
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.lat, current?.lng]);

  // "Desde" autofill: optional cache pin ASAP, final label always from awaited fresh.
  useEffect(() => {
    if (!searchExpanded) return;
    if (!pickupGpsAutofill) return;
    if (pickupPicked || pickupAddress.trim()) return;
    let cancelled = false;
    const fillId = ++gpsFillIdRef.current;
    const isActive = () => !cancelled && fillId === gpsFillIdRef.current;
    setPickupLoading(true);
    (async () => {
      const cached = useLocationStore.getState().current;
      if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng) && isActive()) {
        setPickupCoord({ lat: cached.lat, lng: cached.lng });
      }

      const fix = await requestFreshPosition();
      if (!isActive()) return;
      if (!fix) {
        setPickupLoading(false);
        return;
      }

      setPickupCoord({ lat: fix.lat, lng: fix.lng });
      lastGpsLabel.current = { lat: fix.lat, lng: fix.lng, acc: fix.accuracy };

      const label = await resolveAddressLabel(fix.lat, fix.lng, { accuracy: fix.accuracy });
      if (!isActive()) return;
      setPickupAddress(label);
      setPickupPicked(true);
      setPickupFromGps(true);
      setPickupLoading(false);
      lastGpsLabel.current = { lat: fix.lat, lng: fix.lng, acc: fix.accuracy };
    })();

    return () => {
      cancelled = true;
    };
  }, [searchExpanded, pickupGpsAutofill, pickupPicked, pickupAddress]);

  // Refine "Desde" when GPS moves materially (with usable accuracy) or accuracy improves.
  useEffect(() => {
    if (!searchExpanded || !pickupFromGps || !current) return;
    const prev = lastGpsLabel.current;
    if (!prev) return;
    const acc = current.accuracy ?? Number.POSITIVE_INFINITY;
    const moved = metersBetween(prev, current);
    const muchBetter = acc < prev.acc - 5;
    // Re-reverse on material move only when the new fix is not much worse than the labeled one.
    const jumped = moved > GPS_LABEL_REFINE_M && acc <= Math.max(prev.acc + 15, 80);
    const stillGeneric =
      pickupAddress === 'Mi ubicación actual' && acc <= MAX_LABEL_ACCURACY_M && acc < prev.acc;
    if (!muchBetter && !jumped && !stillGeneric) return;

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
  }, [current?.lat, current?.lng, current?.accuracy, searchExpanded, pickupFromGps, pickupAddress]);

  const handleLocate = () => {
    void (async () => {
      const fix = await (typeof refresh === 'function' ? refresh() : requestFreshPosition());
      // Only bump recenter when we have a fix — empty recenter is a no-op on the map.
      if (fix || useLocationStore.getState().current) {
        setRecenterKey((k) => k + 1);
      }
    })();
  };

  const handleOpenSearch = () => {
    setSearchError(null);
    setPickupGpsAutofill(true);
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
    setPickupGpsAutofill(true);
    lastGpsLabel.current = null;
    setFocusedField('dest');
    setSearchError(null);
  };

  const handleChipSelect = (selection: { address: string; lat?: number; lng?: number }) => {
    const coord =
      selection.lat != null && selection.lng != null
        ? { lat: selection.lat, lng: selection.lng }
        : null;

    if (focusedField === 'pickup') {
      setPickupAddress(selection.address);
      setPickupCoord(coord);
      setPickupPicked(true);
      setPickupFromGps(false);
      setPickupGpsAutofill(false);
      setPickupLoading(false);
      setFocusedField('dest');
    } else {
      setDestAddress(selection.address);
      setDestCoord(coord);
      setDestPicked(true);
      setFocusedField(null);
    }
    Keyboard.dismiss();
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    if (focusedField === 'pickup') {
      setPickupAddress(suggestion.description);
      setPickupCoord({ lat: suggestion.lat, lng: suggestion.lng });
      setPickupPicked(true);
      setPickupFromGps(false);
      setPickupGpsAutofill(false);
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
      // Bump fill id + disable autofill so this tap owns GPS (no concurrent autofill reverse).
      const fillId = ++gpsFillIdRef.current;
      const isActive = () => fillId === gpsFillIdRef.current;
      setPickupGpsAutofill(false);
      setPickupLoading(true);
      setSearchError(null);
      setPickupPicked(false);
      setPickupFromGps(false);
      setPickupAddress('');

      // Provisional pin from cache while fresh GPS loads (label waits on fresh).
      const cached = useLocationStore.getState().current;
      if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng) && isActive()) {
        setPickupCoord({ lat: cached.lat, lng: cached.lng });
      }

      const fix = await requestFreshPosition();
      if (!isActive()) return;
      if (!fix) {
        setPickupLoading(false);
        setPickupCoord(null);
        setPickupAddress('');
        setPickupPicked(false);
        setPickupFromGps(false);
        setSearchError(LOCATION_UNAVAILABLE_MSG);
        return;
      }

      setPickupCoord({ lat: fix.lat, lng: fix.lng });
      const label = await resolveAddressLabel(fix.lat, fix.lng, { accuracy: fix.accuracy });
      if (!isActive()) return;
      setPickupAddress(label);
      setPickupPicked(true);
      setPickupFromGps(true);
      setPickupGpsAutofill(true);
      setPickupLoading(false);
      lastGpsLabel.current = { lat: fix.lat, lng: fix.lng, acc: fix.accuracy };
      setFocusedField('dest');
      Keyboard.dismiss();
    })();
  };

  const clearPickup = () => {
    setPickupGpsAutofill(false);
    setPickupAddress('');
    setPickupCoord(null);
    setPickupPicked(false);
    setPickupFromGps(false);
    setPickupLoading(false);
    lastGpsLabel.current = null;
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

    const bias =
      current && Number.isFinite(current.lat) && Number.isFinite(current.lng)
        ? { lat: current.lat, lng: current.lng }
        : undefined;

    let resolvedPickup = pickupCoord;
    if (!resolvedPickup && pickupAddress.trim()) {
      try {
        const g = await geocodeAddress(pickupAddress.trim(), bias);
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
        const g = await geocodeAddress(dest, bias);
        resolvedDest = { lat: g.lat, lng: g.lng };
      } catch {
        resolvedDest = null;
      }
    }

    if (!resolvedPickup || !resolvedDest) {
      setSearchError(
        'No encontramos esa calle o lugar. Probá otra búsqueda o elegí una sugerencia.',
      );
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
      pickupPicked={pickupPicked}
      destPicked={destPicked}
      suggestions={visibleSuggestions}
      placesLoading={placesLoading}
      placesError={placesError}
      searchError={searchError}
      showUseMyLocation={showUseMyLocation}
      onBack={handleCloseSearch}
      onPickupChange={(text) => {
        setPickupGpsAutofill(false);
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
                // Zoom +/− above search pill (~52) + gap + floating tab bar reserve.
                bottomControlsOffset={
                  tabReserve + theme.dimensions.inputHeight + theme.spacing.md + theme.spacing.sm
                }
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
              {!oofDismissed && shouldShowOutOfServiceBanner(serviceArea) ? (
                <View style={styles.oofBannerWrap} pointerEvents="box-none">
                  <OutOfServiceAreaBanner onDismiss={() => setOofDismissed(true)} />
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.locateBtn}
                onPress={handleLocate}
                activeOpacity={0.8}
                accessibilityLabel="Centrar ubicación"
              >
                <Ionicons name="locate-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>

              <View style={[styles.searchFloat, { bottom: tabReserve + theme.spacing.sm }]}>
                <DestinationSearchPill onPress={handleOpenSearch} />
              </View>
            </View>
          </View>
        )}

        {!searchExpanded ? (
          <BottomTabBar activeTab="home" onSearchPress={handleOpenSearch} visible />
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
  searchFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
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
  oofBannerWrap: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.sm,
    right: 56,
    zIndex: 12,
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
