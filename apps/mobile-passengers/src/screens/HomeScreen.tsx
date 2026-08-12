import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { geocodeAddress } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { HomeHeader } from '../components/HomeHeader';
import { HowItWorks } from '../components/HowItWorks';
import { PassengerMap } from '../components/Map/PassengerMap';
import { QuickChips } from '../components/QuickChips';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocation } from '../hooks/useLocation';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { theme } from '../theme';

export function HomeScreen() {
  const { navigate } = useAppNavigation();
  const { current } = useLocation();

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [recenterKey, setRecenterKey] = useState(0);
  const [destCoord, setDestCoord] = useState<{ lat: number; lng: number } | null>(null);

  const suggestions = usePlaceAutocomplete(destAddress);

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
  };

  const handleChipSelect = (address: string) => {
    setDestAddress(address);
    setDestCoord(null);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    setDestAddress(suggestion.description);
    setDestCoord({ lat: suggestion.lat, lng: suggestion.lng });
  };

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

  return (
    <SafeAreaView style={styles.safe}>
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
                    onChangeText={setPickupAddress}
                  />
                </View>

                <View style={styles.fieldDivider} />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldDotDest} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Hacia"
                    placeholderTextColor={theme.colors.mediumGray}
                    value={destAddress}
                    onChangeText={(text) => {
                      setDestAddress(text);
                      setDestCoord(null);
                    }}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={handleConfirmDestination}
                  />
                </View>
              </View>

              {suggestions.length > 0 ? (
                <View style={styles.suggestions}>
                  {suggestions.map((suggestion) => (
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

        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tab} activeOpacity={0.8}>
            <Ionicons name="home" size={20} color={theme.colors.primary} />
            <Text style={styles.tabActive}>Inicio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={handleOpenSearch} activeOpacity={0.8}>
            <Ionicons name="search" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Buscar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => navigate('TripHistory')}
            activeOpacity={0.8}
          >
            <Ionicons name="list" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Viajes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => navigate('Profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Perfil</Text>
          </TouchableOpacity>
        </View>
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
  tabBar: {
    flexDirection: 'row',
    height: theme.dimensions.tabBarHeight,
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingBottom: theme.spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
  },
  tabActive: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
