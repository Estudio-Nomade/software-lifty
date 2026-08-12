import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  Image,
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
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

const RECENT_PLACES = [
  { name: 'Trabajo', address: 'Av. 9 de Julio 1234' },
  { name: 'Casa', address: 'Av. Corrientes 5678' },
  { name: 'Gimnasio', address: 'Calle Falsa 742' },
];

export function HomeScreen() {
  const { navigate } = useAppNavigation();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const displayName = fullName || email?.split('@')[0] || 'Usuario';

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');

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

  const handleOpenSearch = () => {
    setSearchExpanded(true);
  };

  const handleCloseSearch = () => {
    Keyboard.dismiss();
    setSearchExpanded(false);
    setDestAddress('');
  };

  const handleConfirmDestination = () => {
    if (!destAddress.trim()) return;
    Keyboard.dismiss();
    navigate('VehicleSelect', {
      pickup: pickupAddress,
      destination: destAddress.trim(),
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
                    onChangeText={setDestAddress}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={handleConfirmDestination}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, !destAddress.trim() && styles.confirmBtnDisabled]}
                onPress={handleConfirmDestination}
                disabled={!destAddress.trim()}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={18} color={theme.colors.white} />
                <Text style={styles.confirmBtnText}>Buscar destino</Text>
              </TouchableOpacity>

              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>Lugares recientes</Text>
                {RECENT_PLACES.map((place) => (
                  <TouchableOpacity
                    key={place.name}
                    style={styles.recentItem}
                    onPress={() => setDestAddress(place.address)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recentIconCircle}>
                      <Ionicons name="time-outline" size={18} color={theme.colors.white} />
                    </View>
                    <View style={styles.recentTexts}>
                      <Text style={styles.recentName}>{place.name}</Text>
                      <Text style={styles.recentAddr}>{place.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.greeting}>
              <View style={styles.greetingRow}>
                <View>
                  <Text style={styles.greetingHi}>¡Hola, {displayName}!</Text>
                  <Text style={styles.greetingSub}>¿A dónde vamos hoy?</Text>
                </View>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.searchBar}
              onPress={handleOpenSearch}
              activeOpacity={0.9}
            >
              <Ionicons name="search" size={18} color={theme.colors.mediumGray} />
              <Text style={styles.searchPlaceholder}>¿A dónde vas?</Text>
            </TouchableOpacity>

            <View style={styles.mapArea}>
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
                <Text style={styles.mapLabel}>Mapa</Text>
              </View>
            </View>

            <Text style={styles.suggestionsTitle}>Sugerencias para vos</Text>
            <View style={styles.emptySuggestions}>
              <Ionicons name="compass-outline" size={36} color={theme.colors.mediumGray} />
              <Text style={styles.emptySuggestionsText}>
                Aún no tenés sugerencias.{'\n'}¡Pedí tu primer viaje y empezá a descubrir!
              </Text>
            </View>
          </ScrollView>
        )}

        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tab}>
            <Ionicons name="home" size={20} color={theme.colors.primary} />
            <Text style={styles.tabActive}>Inicio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={handleOpenSearch}>
            <Ionicons name="search" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Buscar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => navigate('TripHistory')}>
            <Ionicons name="list" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Viajes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => navigate('Profile')}>
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
  greeting: {
    backgroundColor: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingHi: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  greetingSub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  logo: {
    width: 72,
    height: 28,
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
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  mapArea: {
    height: 320,
    backgroundColor: '#B8D4E3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholder: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  mapLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  suggestionsTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptySuggestions: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  emptySuggestionsText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 20,
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
  recentSection: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: 8,
  },
  recentTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    marginBottom: 4,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  recentIconCircle: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentTexts: {
    flex: 1,
    gap: 2,
  },
  recentName: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  recentAddr: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  fieldInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    padding: 0,
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
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabActive: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
