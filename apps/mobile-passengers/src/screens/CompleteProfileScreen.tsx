import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProfile, registerPassenger, reverseGeocode, updateProfile } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { AuthFormCard, AuthFormChrome } from '../components/AuthFormChrome';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { requestFreshPosition } from '../hooks/useLocation';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import {
  isPassengerHomeResolved,
  isPassengerPhoneComplete,
  isPassengerProfileComplete,
  joinFullName,
  splitGoogleName,
  writePassengerProfileCompleteCache,
} from '../lib/passengerProfileGate';
import { getFriendlyProfileError } from '../lib/profileErrors';
import { fetchServiceAreaStatus } from '../lib/serviceAreaStatus';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { syncCasaFavoriteFromProfile } from '../store/favoritesStore';
import { theme } from '../theme';

export function CompleteProfileScreen() {
  const { navigate, replace } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const emailFromStore = useAuthStore((s) => s.email);
  const userId = useAuthStore((s) => s.userId);
  const setFullName = useAuthStore((s) => s.setFullName);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(emailFromStore ?? '');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [homeOutside, setHomeOutside] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const addressQuery = showSuggestions && !selectedPlace ? addressLine : '';
  const {
    suggestions,
    loading: placesLoading,
    error: placesError,
  } = usePlaceAutocomplete(addressQuery);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [{ data }, profile] = await Promise.all([
          supabase.auth.getUser(),
          getProfile().catch(() => null),
        ]);
        if (cancelled) return;

        const meta = data.user?.user_metadata as
          | {
              given_name?: string;
              family_name?: string;
              full_name?: string;
              name?: string;
              phone?: string;
              phone_number?: string;
            }
          | undefined;

        const fromMeta = splitGoogleName(meta);
        const fromProfile = splitGoogleName({
          full_name: profile?.full_name ?? undefined,
        });

        setFirstName(fromProfile.firstName || fromMeta.firstName);
        setLastName(fromProfile.lastName || fromMeta.lastName);
        setEmail(profile?.email || data.user?.email || emailFromStore || '');
        setPhone(profile?.phone?.trim() || meta?.phone?.trim() || meta?.phone_number?.trim() || '');

        if (isPassengerHomeResolved(profile ?? {})) {
          const line = profile!.home_address_line!.trim();
          setAddressLine(line);
          setSelectedPlace({
            place_id: 'profile-home',
            description: line,
            lat: profile!.home_lat as number,
            lng: profile!.home_lng as number,
          });
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emailFromStore]);

  const fullName = joinFullName(firstName, lastName);
  const homeReady = Boolean(selectedPlace && addressLine.trim());
  const isValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    isPassengerPhoneComplete(phone) &&
    homeReady &&
    accepted;

  const applyResolvedAddress = (place: PlaceSuggestion) => {
    setAddressLine(place.description);
    setSelectedPlace(place);
    setShowSuggestions(false);
    setHomeOutside(false);
    void fetchServiceAreaStatus(place.lat, place.lng).then((status) => {
      if (status && status.inside === false) setHomeOutside(true);
    });
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    applyResolvedAddress(place);
  };

  const handleUseMyLocation = async () => {
    if (locating || loading) return;
    setLocating(true);
    setError(null);
    try {
      const fix = await requestFreshPosition();
      if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) {
        setError('No se pudo obtener tu ubicación. Probá de nuevo o buscá la dirección.');
        return;
      }
      const geo = await reverseGeocode(fix.lat, fix.lng);
      applyResolvedAddress({
        place_id: `gps-${fix.lat},${fix.lng}`,
        description: geo.formatted_address || `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`,
        lat: fix.lat,
        lng: fix.lng,
      });
    } catch {
      setError('No se pudo obtener tu ubicación. Probá de nuevo o buscá la dirección.');
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async () => {
    if (!isValid || loading || !selectedPlace) {
      setError('Completá nombre, apellido, teléfono, domicilio y aceptá los términos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const phoneTrimmed = phone.trim();
      const homePayload = {
        home_address_line: addressLine.trim(),
        home_lat: selectedPlace.lat,
        home_lng: selectedPlace.lng,
      };
      let updated;
      try {
        updated = await updateProfile({
          full_name: fullName,
          phone: phoneTrimmed,
          ...homePayload,
        });
      } catch (updateErr) {
        const status = (updateErr as { response?: { status?: number } })?.response?.status;
        if (status !== 404) throw updateErr;

        await registerPassenger(phoneTrimmed, fullName, homePayload);
        updated = await getProfile();
        if (!isPassengerProfileComplete(updated)) {
          updated = await updateProfile({
            full_name: fullName,
            phone: phoneTrimmed,
            ...homePayload,
          });
        }
      }

      if (!isPassengerProfileComplete(updated)) {
        updated = await getProfile();
      }

      if (!isPassengerProfileComplete(updated)) {
        setError('No se pudo guardar el perfil. Revisá los datos e intentá de nuevo.');
        return;
      }
      if (updated.full_name) setFullName(updated.full_name);
      syncCasaFavoriteFromProfile(updated);
      if (userId) writePassengerProfileCompleteCache(userId, true);
      replace('LocationPermissions');
    } catch (err) {
      setError(getFriendlyProfileError(err));
    } finally {
      setLoading(false);
    }
  };

  const addressQueryActive = showSuggestions && !selectedPlace && addressLine.trim().length >= 2;
  const showPlacesError = Boolean(placesError && addressQueryActive && !placesLoading);
  const showSuggestionsEmpty =
    addressQueryActive && !placesLoading && !placesError && suggestions.length === 0;
  const showSuggestionsList = addressQueryActive && !placesLoading && suggestions.length > 0;

  const form = (
    <View style={styles.form}>
      <AuthFormChrome
        brand="Lifty"
        title="Completá tu perfil"
        subtitle="Confirmá tus datos para seguir"
      />

      <AuthFormCard>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nombre</Text>
          <Input
            placeholder="Nombre"
            value={firstName}
            onChangeText={setFirstName}
            autoFocus={!booting}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Apellido</Text>
          <Input placeholder="Apellido" value={lastName} onChangeText={setLastName} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={() => {}}
            keyboardType="email-address"
            disabled
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Teléfono</Text>
          <Input
            placeholder="Ej. 11 1234 5678"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={[styles.fieldGroup, styles.addressFieldGroup]}>
          <Text style={styles.fieldLabel}>Domicilio de casa</Text>
          <View style={styles.addressBlock}>
            <Input
              placeholder="Calle, altura, ciudad…"
              value={addressLine}
              onChangeText={(t) => {
                setAddressLine(t);
                setSelectedPlace(null);
                setShowSuggestions(true);
                setHomeOutside(false);
              }}
            />
            {addressQueryActive ? (
              <View style={styles.suggestionsPanel}>
                {placesLoading ? (
                  <View style={styles.placesStatusRow}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={styles.placesStatusText}>Buscando direcciones…</Text>
                  </View>
                ) : null}
                {showPlacesError ? <Text style={styles.placesErrorText}>{placesError}</Text> : null}
                {showSuggestionsEmpty ? (
                  <Text style={styles.placesEmptyText}>No encontramos esa dirección</Text>
                ) : null}
                {showSuggestionsList ? (
                  <ScrollView
                    style={styles.suggestionsScroll}
                    contentContainerStyle={styles.suggestionsScrollContent}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    bounces={false}
                    showsVerticalScrollIndicator
                  >
                    {suggestions.map((s, index) => {
                      const isLast = index === suggestions.length - 1;
                      return (
                        <Pressable
                          key={`${s.place_id}-${s.description}`}
                          style={[styles.suggestionRow, isLast && styles.suggestionRowLast]}
                          onPress={() => handleSelectPlace(s)}
                          accessibilityRole="button"
                          accessibilityLabel={`Elegir ${s.description}`}
                        >
                          <Ionicons
                            name="location-outline"
                            size={16}
                            color={theme.colors.mediumGray}
                            style={styles.suggestionIcon}
                          />
                          <Text style={styles.suggestionText} numberOfLines={2}>
                            {s.description}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.useLocationBtn}
              onPress={handleUseMyLocation}
              disabled={locating || loading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Usar mi ubicación actual"
            >
              <Ionicons name="navigate-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.useLocationText}>
                {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
              </Text>
            </TouchableOpacity>
            {selectedPlace ? (
              <Text style={styles.addressResolved} numberOfLines={2}>
                Domicilio listo
              </Text>
            ) : addressLine.trim().length >= 2 ? (
              <Text style={styles.addressHint}>Elegí una sugerencia o usá tu ubicación</Text>
            ) : null}
            {homeOutside ? (
              <View style={styles.outsideBanner} accessibilityRole="summary">
                <Ionicons name="information-circle-outline" size={18} color={theme.colors.amber} />
                <Text style={styles.outsideBannerText}>
                  Tu casa está fuera del área actual de Lifty. Podés guardar igual; te avisamos
                  cuando abramos tu zona.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          style={styles.termsRow}
          onPress={() => setAccepted(!accepted)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.termsText}>
            Acepto{' '}
            <Text style={styles.termsLink} onPress={() => navigate('Terms', { from: 'profile' })}>
              términos y condiciones
            </Text>
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AuthFormCard>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: theme.spacing.md }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        {form}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
        <Button
          variant="primary"
          onPress={handleSubmit}
          loading={loading || booting}
          disabled={!isValid || loading || booting}
        >
          Continuar
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  form: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  fieldGroup: {
    width: '100%',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  addressFieldGroup: {
    zIndex: 2,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  addressBlock: {
    width: '100%',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  suggestionsPanel: {
    width: '100%',
    maxHeight: 180,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  suggestionsScroll: {
    maxHeight: 180,
  },
  suggestionsScrollContent: {
    paddingVertical: 0,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.lightGray,
    minWidth: 0,
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionIcon: {
    marginTop: 2,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  placesStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  placesStatusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
  placesErrorText: {
    padding: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.regular,
  },
  placesEmptyText: {
    padding: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 40,
    alignSelf: 'flex-start',
  },
  useLocationText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  addressResolved: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.success,
  },
  addressHint: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  outsideBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  outsideBannerText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  termsText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    flex: 1,
  },
  termsLink: {
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  footer: {
    backgroundColor: theme.colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
});
