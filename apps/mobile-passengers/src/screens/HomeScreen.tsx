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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { geocodeAddress, getActiveRide } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { BottomTabBar } from '../components/BottomTabBar';
import { HomeHeader } from '../components/HomeHeader';
import { HowItWorks } from '../components/HowItWorks';
import { PassengerMap } from '../components/Map/PassengerMap';
import { QuickChips } from '../components/QuickChips';
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
  const lastGpsLabel = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  const pickupSuggestions = usePlaceAutocomplete(
    focusedField === 'pickup' && !pickupPicked ? pickupAddress : '',
  );
  const destSuggestions = usePlaceAutocomplete(
    focusedField === 'dest' && !destPicked ? destAddress : '',
  );
  const visibleSuggestions = focusedField === 'pickup' ? pickupSuggestions : destSuggestions;

  // "Desde" autofill: wait for best GPS (not first coarse WiFi), then label.
  useEffect(() => {
    if (!searchExpanded) return;
    if (pickupPicked || pickupAddress.trim()) return;
    let cancelled = false;
    (async () => {
      const fix = await requestFreshPosition();
      if (cancelled || !fix) return;

      const acc = fix.accuracy ?? Number.POSITIVE_INFINITY;
      setPickupCoord({ lat: fix.lat, lng: fix.lng });
      // Coarse WiFi/IP must not freeze a wrong street name.
      const label = await resolveAddressLabel(fix.lat, fix.lng, { accuracy: acc });
      if (cancelled) return;
      setPickupAddress(label);
      setPickupPicked(true);
      setPickupFromGps(true);
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
    lastGpsLabel.current = null;
    setFocusedField('dest');
    setSearchError(null);
  };

  const handleChipSelect = (address: string) => {
    setDestAddress(address);
    setDestCoord(null);
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
    } else {
      setDestAddress(suggestion.description);
      setDestCoord({ lat: suggestion.lat, lng: suggestion.lng });
      setDestPicked(true);
    }
    setFocusedField(null);
    Keyboard.dismiss();
  };

  const clearPickup = () => {
    setPickupAddress('');
    setPickupCoord(null);
    setPickupPicked(false);
    setPickupFromGps(false);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.bodyWrap}>
        {searchExpanded ? (
          <KeyboardAvoidingView
            style={styles.expandedSearch}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.expandedHeader}>
              <TouchableOpacity onPress={handleCloseSearch} style={styles.expandedBack}>
                <Ionicons name="arrow-back" size={22} color={theme.colors.white} />
              </TouchableOpacity>
              <Text style={styles.expandedTitle}>Solicitar viaje</Text>
            </View>

            <ScrollView
              style={styles.expandedBody}
              contentContainerStyle={styles.expandedBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.searchFields}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldDotPickup} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Desde"
                    placeholderTextColor={theme.colors.mediumGray}
                    value={pickupAddress}
                    onFocus={() => setFocusedField('pickup')}
                    onChangeText={(text) => {
                      setPickupAddress(text);
                      setPickupCoord(null);
                      setPickupPicked(false);
                      setPickupFromGps(false);
                      setFocusedField('pickup');
                      setSearchError(null);
                    }}
                  />
                  {pickupAddress.trim().length > 0 ? (
                    <TouchableOpacity
                      style={styles.fieldClear}
                      onPress={clearPickup}
                      accessibilityLabel="Borrar origen"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={theme.colors.mediumGray} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.fieldDivider} />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldDotDest} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Hacia"
                    placeholderTextColor={theme.colors.mediumGray}
                    value={destAddress}
                    onFocus={() => setFocusedField('dest')}
                    onChangeText={(text) => {
                      setDestAddress(text);
                      setDestCoord(null);
                      setDestPicked(false);
                      setFocusedField('dest');
                      setSearchError(null);
                    }}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={handleConfirmDestination}
                  />
                  {destAddress.trim().length > 0 ? (
                    <TouchableOpacity
                      style={styles.fieldClear}
                      onPress={clearDest}
                      accessibilityLabel="Borrar destino"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={theme.colors.mediumGray} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {visibleSuggestions.length > 0 ? (
                <View style={styles.suggestions}>
                  {visibleSuggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion.place_id}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectSuggestion(suggestion)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location-outline" size={18} color={theme.colors.mediumGray} />
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {suggestion.description}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <QuickChips onSelect={handleChipSelect} />

              {searchError ? (
                <View style={styles.searchErrorBox} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={theme.colors.dangerRed} />
                  <Text style={styles.searchErrorText}>{searchError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.confirmBtn, !destAddress.trim() && styles.confirmBtnDisabled]}
                onPress={handleConfirmDestination}
                disabled={!destAddress.trim()}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={18} color={theme.colors.white} />
                <Text style={styles.confirmBtnText}>Buscar destino</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <HomeHeader />

            <TouchableOpacity
              style={styles.searchBar}
              onPress={handleOpenSearch}
              activeOpacity={0.9}
            >
              <Ionicons name="search" size={18} color={theme.colors.mediumGray} />
              <Text style={styles.searchPlaceholder}>¿A dónde vas?</Text>
            </TouchableOpacity>

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

            <HowItWorks />
          </ScrollView>
        )}

        <BottomTabBar activeTab="home" onSearchPress={handleOpenSearch} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  bodyWrap: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    backgroundColor: theme.colors.lightGray,
  },
  bodyContent: {
    paddingBottom: theme.spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 12,
    gap: 8,
    height: 48,
    ...theme.shadows.card,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  mapArea: {
    height: 200,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  mapFill: {
    flex: 1,
  },
  locateBtn: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
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
    borderRadius: theme.radius.sm,
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
    backgroundColor: theme.colors.deepBlue,
  },
  expandedBody: {
    flex: 1,
  },
  expandedBodyContent: {
    paddingBottom: theme.spacing.md,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.dimensions.navbarHeight,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  expandedBack: {
    padding: theme.spacing.sm,
  },
  expandedTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  searchFields: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    gap: 12,
  },
  fieldDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  fieldDotDest: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.dangerRed,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: theme.colors.lightGray,
    marginHorizontal: 12,
  },
  fieldInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    padding: 0,
  },
  fieldClear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestions: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
  },
  suggestionText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  searchErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  searchErrorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    height: 48,
    gap: 8,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
});
