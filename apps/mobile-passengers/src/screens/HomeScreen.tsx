import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { useLocation } from '../hooks/useLocation';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export function HomeScreen() {
  const { navigate, replace } = useAppNavigation();
  const { current } = useLocation();
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

  const pickupSuggestions = usePlaceAutocomplete(
    focusedField === 'pickup' && !pickupPicked ? pickupAddress : '',
  );
  const destSuggestions = usePlaceAutocomplete(
    focusedField === 'dest' && !destPicked ? destAddress : '',
  );
  const visibleSuggestions = focusedField === 'pickup' ? pickupSuggestions : destSuggestions;

  useEffect(() => {
    if (!searchExpanded) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      if (cancelled) return;
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (cancelled) return;
      const name =
        addr?.street && addr?.streetNumber
          ? `${addr.street} ${addr.streetNumber}`
          : (addr?.name ?? '');
      setPickupAddress(
        name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
      );
      setPickupCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setPickupPicked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchExpanded]);

  const handleLocate = () => {
    setRecenterKey((k) => k + 1);
  };

  const handleOpenSearch = () => {
    setSearchExpanded(true);
  };

  const handleCloseSearch = () => {
    Keyboard.dismiss();
    setSearchExpanded(false);
    setDestAddress('');
    setDestCoord(null);
    setPickupPicked(false);
    setDestPicked(false);
    setFocusedField('dest');
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
      Alert.alert('No encontramos esa dirección', 'Revisá la dirección e intentá de nuevo.');
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
                      setFocusedField('pickup');
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
                centerCoordinate={current ? [current.lng, current.lat] : [-58.3816, -34.6037]}
                userLocation={current ? [current.lng, current.lat] : null}
                followUserLocation
                recenterKey={recenterKey}
                style={styles.mapFill}
              />
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
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
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
