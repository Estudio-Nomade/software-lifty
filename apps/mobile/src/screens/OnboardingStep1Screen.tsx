import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  type KeyboardEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { userFacingApiMessage } from '../api/mapAxiosError';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { OnboardingCard, OnboardingChrome } from '../components/OnboardingChrome';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { type PlaceSuggestion, usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import {
  DRIVER_PROFILE_PHOTO_HINT,
  DRIVER_PROFILE_PHOTO_PERMISSION_MSG,
  DRIVER_PROFILE_PHOTO_REQUIRED_MSG,
  DRIVER_PROFILE_PHOTO_UPLOAD_FAIL_MSG,
  isDriverProfilePhotoPresent,
  isDriverProfilePhotoRemote,
} from '../lib/driverProfilePhoto';
import { exitOnboardingToWelcome } from '../lib/exitOnboardingToWelcome';
import { getCurrentPosition } from '../lib/location';
import { resolveApiAccessToken } from '../lib/oauthSessionRecovery';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import {
  ensureActiveServiceMarkets,
  getServiceMarketsVersion,
  isInsidePickupArea,
} from '../lib/serviceArea';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { uploadPhotoToBackend } from '../utils/upload';

interface ValidationErrors {
  firstName?: string;
  lastName?: string;
  address?: string;
  photo?: string;
}

const MIN_PHONE_DIGITS = 10;
const MIN_ADDRESS_CHARS = 5;

function formatPhone(digits: string): string {
  if (digits.length === 0) return '';
  let result = digits[0];
  if (digits.length > 1) result += ` ${digits.slice(1, Math.min(digits.length, 3))}`;
  if (digits.length > 3) result += ` ${digits.slice(3, Math.min(digits.length, 7))}`;
  if (digits.length > 7) result += `-${digits.slice(7, 11)}`;
  return result;
}

const validateName = (value: string) => {
  if (!value.trim()) return undefined;
  if (value.length > 100) return 'Maximo 100 caracteres';
  if (/\d/.test(value)) return 'No puede contener numeros';
  return undefined;
};

const isFormValid = (
  firstName: string,
  lastName: string,
  phoneDigits: string,
  addressLine: string,
  termsAccepted: boolean,
  photoUri: string | null,
  hasResolvedPlace: boolean,
) => {
  return (
    firstName.trim() !== '' &&
    !validateName(firstName) &&
    lastName.trim() !== '' &&
    !validateName(lastName) &&
    phoneDigits.length >= MIN_PHONE_DIGITS &&
    addressLine.trim().length >= MIN_ADDRESS_CHARS &&
    hasResolvedPlace &&
    termsAccepted &&
    isDriverProfilePhotoPresent(photoUri)
  );
};

const WAITLIST_MSG =
  'Todavía no operamos en esa ubicación. No vas a poder conectar online hasta que Lifty esté en tu localidad. Podés seguir el alta ahora y te avisamos cuando abramos en tu zona.';

const ADDRESS_PICK_REQUIRED_MSG =
  'Confirmá el domicilio eligiendo una sugerencia o tocando “Usar mi ubicación”.';

const ADDRESS_EMPTY_MSG = 'No encontramos esa dirección. Probá otra o usá tu ubicación.';

type AddressZone = 'unknown' | 'inside' | 'outside';

function zoneForCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): AddressZone {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'unknown';
  }
  return isInsidePickupArea(lat, lng) ? 'inside' : 'outside';
}

function readMunicipalityStatus(payload: unknown): string | undefined {
  if (payload == null || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  if (typeof root.municipality_status === 'string') return root.municipality_status;
  const nested = root.data;
  if (nested != null && typeof nested === 'object') {
    const status = (nested as Record<string, unknown>).municipality_status;
    if (typeof status === 'string') return status;
  }
  return undefined;
}

function readOnboardingStep(payload: unknown): string {
  if (payload == null || typeof payload !== 'object') return 'kyc';
  const root = payload as Record<string, unknown>;
  if (typeof root.step === 'string' && root.step.length > 0) return root.step;
  const nested = root.data;
  if (nested != null && typeof nested === 'object') {
    const step = (nested as Record<string, unknown>).step;
    if (typeof step === 'string' && step.length > 0) return step;
  }
  return 'kyc';
}

export const OnboardingStep1Screen: React.FC = () => {
  const navigation = useAppNavigation();
  const { signOut } = useAuth();
  const exitingRef = useRef(false);

  const handleBack = useCallback(async () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    try {
      await exitOnboardingToWelcome({
        signOut,
        clearAuthState: () => useAuthStore.getState().clearAuthState(),
      });
    } finally {
      exitingRef.current = false;
    }
  }, [signOut]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [addressSelection, setAddressSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [keyboardPad, setKeyboardPad] = useState(0);
  /** Bumps when GET /service-markets/active hydrates so zone re-evaluates (Tandil etc.). */
  const [marketsVersion, setMarketsVersion] = useState(getServiceMarketsVersion);
  const profileLoaded = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const addressFieldRef = useRef<ComponentRef<typeof View>>(null);
  const scrollOffsetY = useRef(0);
  const keyboardHeightRef = useRef(0);
  /** Bumps on each place pick / clear / locate so stale hydrate completions don't overwrite. */
  const addressPinGenRef = useRef(0);
  /** Auth token — hydrate must re-run when session appears (mount often races pre-token). */
  const authToken = useAuthStore((s) => s.token);

  const gpsLat = useLocationStore((s) => s.lat);
  const gpsLng = useLocationStore((s) => s.lng);
  const locationError = useLocationStore((s) => s.locationError);
  const placeBias = gpsLat != null && gpsLng != null ? { lat: gpsLat, lng: gpsLng } : null;

  const {
    suggestions,
    loading: placesLoading,
    error: placesError,
  } = usePlaceAutocomplete(showSuggestions ? addressLine : '', placeBias);

  const addressZone: AddressZone = useMemo(() => {
    if (!selectedPlace) return 'unknown';
    return zoneForCoords(selectedPlace.lat, selectedPlace.lng);
  }, [selectedPlace, marketsVersion]);
  // Banner only from live pin — never sticky after a prior waitlisted submit.
  const showWaitlistBanner = addressZone === 'outside';

  const addressQueryActive = showSuggestions && !selectedPlace && addressLine.trim().length >= 2;
  const showSuggestionsList = addressQueryActive && !placesLoading && suggestions.length > 0;
  const showSuggestionsEmpty =
    addressQueryActive && !placesLoading && !placesError && suggestions.length === 0;
  const showPlacesError = addressQueryActive && !placesLoading && !!placesError;

  useEffect(() => {
    let cancelled = false;
    // Re-hydrate whenever token appears/changes. Pre-token 401 must not stick LEGACY_VD.
    // ensure never rejects (swallows network/401); .catch is belt-and-suspenders.
    void ensureActiveServiceMarkets({ force: true })
      .then((version) => {
        if (!cancelled) setMarketsVersion(version);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    // Wait for Bearer (OAuth/email lag). Pre-token 401 must not stick empty forever.
    if (!authToken || profileLoaded.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await apiClient.get('/drivers/me');
        if (cancelled) return;

        if (data?.full_name) {
          const nameParts = (data.full_name as string).split(' ');
          const fn = nameParts[0] ?? '';
          const ln = nameParts.slice(1).join(' ') ?? '';
          setFirstName(fn);
          setLastName(ln);
        }

        const phone: string = data?.phone ?? '';
        const digits = phone.startsWith('+54')
          ? phone.slice(3).replace(/\D/g, '')
          : phone.replace(/\D/g, '');
        if (digits) setPhoneDigits(digits);
        if (data?.avatar_url) setPhotoUri(data.avatar_url as string);
        if (data?.address_line) {
          setAddressLine(data.address_line as string);
          if (data.address_lat != null && data.address_lng != null) {
            setSelectedPlace({
              description: data.address_line as string,
              place_id: '',
              lat: Number(data.address_lat),
              lng: Number(data.address_lng),
            });
          }
        }
        profileLoaded.current = true;
      } catch {
        // Silently ignore — the form stays empty, user fills it manually
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const addressFocusedRef = useRef(false);
  const scrollAddressIntoViewRef = useRef<() => void>(() => {});
  const scrollRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const typeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAddressFieldHRef = useRef(0);

  const clearScrollRetries = useCallback(() => {
    for (const t of scrollRetryTimersRef.current) clearTimeout(t);
    scrollRetryTimersRef.current = [];
    if (typeScrollTimerRef.current) {
      clearTimeout(typeScrollTimerRef.current);
      typeScrollTimerRef.current = null;
    }
  }, []);

  const resolveKeyboardHeight = useCallback(() => {
    if (keyboardHeightRef.current > 0) return keyboardHeightRef.current;
    return Keyboard.metrics()?.height ?? 0;
  }, []);

  const scrollAddressIntoView = useCallback(() => {
    const run = () => {
      if (!addressFocusedRef.current) return;
      const field = addressFieldRef.current;
      const scroll = scrollRef.current;
      if (!field || !scroll) return;

      const kb = resolveKeyboardHeight();
      // Wait for real keyboard height so visibleBottom is not full-window (wrong delta).
      if (kb <= 0) return;
      keyboardHeightRef.current = kb;

      field.measureInWindow((_x, fieldY, _w, fieldH) => {
        if (!addressFocusedRef.current) return;
        lastAddressFieldHRef.current = fieldH;
        const winH = Dimensions.get('window').height;
        const screenH = Dimensions.get('screen').height;
        // Android adjustResize: window already excludes IME — subtracting kb again
        // collapses visibleBottom and clamps scroll short of the caret.
        const androidWindowShrunk =
          Platform.OS === 'android' && screenH - winH >= Math.min(kb * 0.45, 100);
        const visibleBottom = androidWindowShrunk ? winH - 28 : winH - kb - 28;
        const fieldTopTarget = fieldY;
        // Caret lives near top of multiline; keep a short band above the IME.
        const fieldCaretBand = fieldY + Math.min(Math.max(fieldH, 48), 64);
        const topGuard = Platform.OS === 'ios' ? 100 : 72;

        let delta = 0;
        if (fieldCaretBand > visibleBottom) {
          delta = fieldCaretBand - visibleBottom;
        } else if (fieldTopTarget < topGuard) {
          delta = fieldTopTarget - topGuard;
        }
        if (Math.abs(delta) < 2) return;
        const nextY = Math.max(0, scrollOffsetY.current + delta);
        // Keep offset in sync — onScroll may lag behind programmatic scrollTo.
        scrollOffsetY.current = nextY;
        scroll.scrollTo({ y: nextY, animated: true });
      });
    };
    requestAnimationFrame(() => {
      setTimeout(run, Platform.OS === 'ios' ? 50 : 80);
    });
  }, [resolveKeyboardHeight]);

  // Keyboard/focus path: Android needs a few passes (pad + IME). iOS: one post-KAV settle
  // only — multi-retry stacks with automaticallyAdjustKeyboardInsets and double-jumps.
  const scheduleScrollAddressIntoView = useCallback(() => {
    clearScrollRetries();
    const delays = Platform.OS === 'ios' ? [180] : [60, 160, 340];
    for (const d of delays) {
      const t = setTimeout(() => {
        if (addressFocusedRef.current) scrollAddressIntoViewRef.current();
      }, d);
      scrollRetryTimersRef.current.push(t);
    }
  }, [clearScrollRetries]);

  // Typing path: trailing debounce, single measure — no retry storm per keystroke.
  const scheduleScrollOnAddressType = useCallback(() => {
    if (typeScrollTimerRef.current) clearTimeout(typeScrollTimerRef.current);
    typeScrollTimerRef.current = setTimeout(() => {
      typeScrollTimerRef.current = null;
      if (!addressFocusedRef.current) return;
      const field = addressFieldRef.current;
      if (!field) {
        scrollAddressIntoViewRef.current();
        return;
      }
      // Only nudge when multiline actually grew past last known height.
      field.measureInWindow((_x, _y, _w, fieldH) => {
        if (!addressFocusedRef.current) return;
        if (fieldH <= lastAddressFieldHRef.current + 2) return;
        lastAddressFieldHRef.current = fieldH;
        scrollAddressIntoViewRef.current();
      });
    }, 220);
  }, []);

  useEffect(() => {
    scrollAddressIntoViewRef.current = scrollAddressIntoView;
  }, [scrollAddressIntoView]);

  // Extra bottom room while keyboard is open so Domicilio can scroll above it.
  // Android adjustResize shrinks the window — pad is scroll runway (not KAV).
  // iOS: KAV + automaticallyAdjustKeyboardInsets own the lift; pad stays modest.
  // Primary scroll trigger is keyboard show (height known); focus alone is a no-op until then.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates.height;
      keyboardHeightRef.current = h;
      // Android residual post-#522: max(160, h*0.2) left no runway under photo+3 fields.
      setKeyboardPad(Platform.OS === 'android' ? Math.max(280, Math.round(h * 0.55)) : 80);
      if (addressFocusedRef.current) {
        scheduleScrollAddressIntoView();
      }
    };
    const onHide = () => {
      keyboardHeightRef.current = 0;
      setKeyboardPad(0);
      lastAddressFieldHRef.current = 0;
      clearScrollRetries();
    };
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
      clearScrollRetries();
    };
  }, [scheduleScrollAddressIntoView, clearScrollRetries]);

  const handleAddressFocus = useCallback(() => {
    addressFocusedRef.current = true;
    setShowSuggestions(true);
    // Keyboard already open (refocus): scroll now. First open: onShow owns scroll.
    // Avoid stacking with onShow when height is still settling from a fresh open.
    if (keyboardHeightRef.current > 0) {
      scheduleScrollAddressIntoView();
    }
  }, [scheduleScrollAddressIntoView]);

  const setError = (field: keyof ValidationErrors, error: string | undefined) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', DRIVER_PROFILE_PHOTO_PERMISSION_MSG);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      try {
        const compressed = await compressImage(asset.uri);
        setPhotoUri(compressed.uri);
      } catch (err) {
        console.warn('Image compression failed, using original:', err);
        setPhotoUri(asset.uri);
      }
      setError('photo', undefined);
    }
  };

  const applyResolvedAddress = (place: PlaceSuggestion) => {
    setAddressLine(place.description);
    // One-shot: show start of long labels, then release so the user can edit freely.
    setAddressSelection({ start: 0, end: 0 });
    setSelectedPlace(place);
    setShowSuggestions(false);
    setError('address', undefined);
    setTimeout(() => setAddressSelection(undefined), 0);
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    // Apply pin sync (no stale overwrite if user picks again / clears while hydrate runs).
    const gen = ++addressPinGenRef.current;
    applyResolvedAddress(place);
    // Force multi-hub hydrate; zone re-evals via marketsVersion when gen still current.
    void ensureActiveServiceMarkets({ force: true })
      .then((version) => {
        if (gen !== addressPinGenRef.current) return;
        setMarketsVersion(version);
      })
      .catch(() => undefined);
  };

  const handleClearAddress = () => {
    addressPinGenRef.current += 1;
    setAddressLine('');
    setAddressSelection(undefined);
    setSelectedPlace(null);
    setShowSuggestions(false);
    setError('address', undefined);
  };

  const handleChangeAddress = () => {
    handleClearAddress();
    setShowSuggestions(true);
  };

  /** GPS → reverse geocode → pin with lat/lng for backend municipality gate. */
  const handleUseMyLocation = async () => {
    const gen = ++addressPinGenRef.current;
    setLocating(true);
    setSubmitError('');
    setError('address', undefined);
    // Only coords accepted after getCurrentPosition in THIS tap — never re-read the
    // global location store in the outer catch (stale pin from another screen/attempt).
    let callLat: number | null = null;
    let callLng: number | null = null;
    try {
      // Close OAuth→Paso1 race: always reconcile store Bearer vs live Supabase session
      // (stale/blocked store token is as bad as missing token).
      try {
        const store = useAuthStore.getState();
        const { data } = await supabase.auth.getSession();
        const live = data.session;
        const token = resolveApiAccessToken({
          storeToken: store.token,
          storeUserId: store.driverId,
          liveSession: live,
        });
        // resolveApiAccessToken prefers live when present; write store whenever
        // token/user/auth lag (stale null store, wrong driverId, or not authed flag).
        if (token && live?.user?.id) {
          if (token !== store.token || live.user.id !== store.driverId || !store.isAuthenticated) {
            store.setSession(token, live.user.id);
          }
        }
      } catch {
        // interceptor may still hydrate on the geocode request
      }

      // Parallel: force multi-hub hydrate while GPS runs (Tandil etc.).
      const hydrateP = ensureActiveServiceMarkets({ force: true }).catch(() =>
        getServiceMarketsVersion(),
      );

      await getCurrentPosition();
      if (gen !== addressPinGenRef.current) return;
      const { lat, lng, locationError: geoErr } = useLocationStore.getState();
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError(
          'address',
          geoErr || locationError || 'No pudimos obtener tu ubicación. Activá el GPS.',
        );
        return;
      }
      callLat = lat;
      callLng = lng;

      let label = `Ubicación actual (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      let pinLat = lat;
      let pinLng = lng;
      try {
        const { data: body } = await apiClient.get<
          | {
              formatted_address?: string;
              lat?: number;
              lng?: number;
              city?: string | null;
              province?: string | null;
            }
          | {
              data?: {
                formatted_address?: string;
                lat?: number;
                lng?: number;
                city?: string | null;
                province?: string | null;
              };
            }
        >('/maps/geocode', { params: { lat, lng } });
        // Support flat maps payload or accidental { data } envelope.
        const data =
          body &&
          typeof body === 'object' &&
          'data' in body &&
          body.data &&
          typeof body.data === 'object'
            ? body.data
            : body;
        const formatted =
          data && typeof data === 'object' && 'formatted_address' in data
            ? data.formatted_address
            : undefined;
        const city = data && typeof data === 'object' && 'city' in data ? data.city : undefined;
        const province =
          data && typeof data === 'object' && 'province' in data ? data.province : undefined;
        label =
          (formatted && String(formatted).trim()) ||
          [city, province].filter(Boolean).join(', ') ||
          label;
        if (data && typeof data === 'object') {
          const d = data as { lat?: number; lng?: number };
          if (typeof d.lat === 'number' && Number.isFinite(d.lat)) pinLat = d.lat;
          if (typeof d.lng === 'number' && Number.isFinite(d.lng)) pinLng = d.lng;
        }
      } catch (geoErrCatch: unknown) {
        // GPS pin is enough for municipality gate; reverse-geocode is best-effort.
        if (__DEV__) {
          const code =
            geoErrCatch && typeof geoErrCatch === 'object' && 'code' in geoErrCatch
              ? String((geoErrCatch as { code?: string }).code)
              : undefined;
          const message =
            geoErrCatch instanceof Error ? geoErrCatch.message : String(geoErrCatch ?? '');
          console.warn('[UseMyLocation] geocode soft-fail', { code, message });
        }
      }
      if (gen !== addressPinGenRef.current) return;

      const place: PlaceSuggestion = {
        description: label,
        place_id: `gps:${lat.toFixed(6)},${lng.toFixed(6)}`,
        lat: pinLat,
        lng: pinLng,
      };
      // Await hydrate before pin so zone preview uses fresh hubs (no false waitlist flash).
      try {
        const version = await hydrateP;
        if (gen !== addressPinGenRef.current) return;
        setMarketsVersion(version);
      } catch {
        // zone preview can stay on last/legacy hubs
      }
      if (gen !== addressPinGenRef.current) return;
      applyResolvedAddress(place);
    } catch (err: unknown) {
      if (gen !== addressPinGenRef.current) return;
      if (__DEV__) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : undefined;
        console.warn('[UseMyLocation] outer error', { code, err });
      }
      // Soft outer failure: pin only coords proven in THIS tap (callLat/Lng), not store leftovers.
      if (
        callLat != null &&
        callLng != null &&
        Number.isFinite(callLat) &&
        Number.isFinite(callLng)
      ) {
        applyResolvedAddress({
          description: `Ubicación actual (${callLat.toFixed(5)}, ${callLng.toFixed(5)})`,
          place_id: `gps:${callLat.toFixed(6)},${callLng.toFixed(6)}`,
          lat: callLat,
          lng: callLng,
        });
        return;
      }
      // Never paint INTERNAL_ERROR / "inesperado del servidor" on this CTA.
      setError(
        'address',
        userFacingApiMessage(err, {
          context: 'location',
          fallback: 'No pudimos ubicar tu posición.',
        }),
      );
    } finally {
      if (gen === addressPinGenRef.current) setLocating(false);
    }
  };

  const handleContinue = async () => {
    if (
      !isFormValid(
        firstName,
        lastName,
        phoneDigits,
        addressLine,
        termsAccepted,
        photoUri,
        !!selectedPlace,
      )
    ) {
      if (!isDriverProfilePhotoPresent(photoUri)) {
        setError('photo', DRIVER_PROFILE_PHOTO_REQUIRED_MSG);
      }
      if (!selectedPlace) {
        setError('address', ADDRESS_PICK_REQUIRED_MSG);
      }
      return;
    }
    setLoading(true);
    setSubmitError('');
    setError('photo', undefined);

    try {
      let uploadedPhotoUrl: string | null = null;

      if (isDriverProfilePhotoRemote(photoUri)) {
        uploadedPhotoUrl = photoUri!.trim();
      } else {
        try {
          const result = await uploadPhotoToBackend(photoUri!, 'avatar.jpg', 'image/jpeg');
          uploadedPhotoUrl = result.file_url;
        } catch (err) {
          console.error('Photo upload error:', err);
          setError('photo', DRIVER_PROFILE_PHOTO_UPLOAD_FAIL_MSG);
          setSubmitError(DRIVER_PROFILE_PHOTO_UPLOAD_FAIL_MSG);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: `+54${phoneDigits}`,
        address_line: addressLine.trim(),
        photo_url: uploadedPhotoUrl,
        address_lat: selectedPlace!.lat,
        address_lng: selectedPlace!.lng,
      };
      if (selectedPlace!.place_id) payload.address_place_id = selectedPlace!.place_id;

      const { data } = await apiClient.put('/drivers/me', payload);

      const municipalityStatus = readMunicipalityStatus(data);
      if (municipalityStatus === 'waitlisted') {
        const shouldContinue = await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          Alert.alert(
            'Todavía no operamos acá',
            WAITLIST_MSG,
            [
              {
                text: 'Cambiar domicilio',
                style: 'cancel',
                onPress: () => finish(false),
              },
              { text: 'Continuar igual', onPress: () => finish(true) },
            ],
            {
              // Android back / outside tap must not leave submit hanging on loading.
              cancelable: true,
              onDismiss: () => finish(false),
            },
          );
        });
        if (!shouldContinue) {
          handleChangeAddress();
          return;
        }
      }

      const step = readOnboardingStep(data);
      useAuthStore.getState().setOnboardingStep(step);
      const target = STEP_ROUTE[step];
      if (target) {
        navigation.replace(target.screen);
      } else {
        navigation.replace('KYCVerify');
      }
    } catch (err: unknown) {
      // Continuar is PUT /drivers/me (+ municipality). Guest/401 or opaque 500
      // must not show «Error inesperado del servidor» in the submit banner.
      if (__DEV__) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : undefined;
        const status =
          err && typeof err === 'object' && 'status' in err
            ? Number((err as { status?: number }).status)
            : undefined;
        console.warn('[OnboardingStep1] Continuar error', { code, status, err });
      }
      setSubmitError(
        userFacingApiMessage(err, {
          context: 'save',
          fallback: 'No pudimos guardar los datos. Revisá la conexión e intentá de nuevo.',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const formOk = isFormValid(
    firstName,
    lastName,
    phoneDigits,
    addressLine,
    termsAccepted,
    photoUri,
    !!selectedPlace,
  );

  const formBody = (
    <>
      <OnboardingChrome
        step={1}
        kicker="Perfil"
        title="Contanos quién sos"
        subtitle="Con estos datos te van a reconocer pasajeros y soporte."
      />

      <OnboardingCard>
        <TouchableOpacity
          style={styles.avatarRow}
          onPress={takePhoto}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Cambiar foto con cámara' : 'Sacar foto de perfil'}
        >
          <View style={[styles.avatarCircle, photoUri ? styles.avatarCircleFilled : null]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="camera-outline" size={28} color={theme.colors.primary} />
            )}
          </View>
          <View style={styles.avatarCopy}>
            <Text style={styles.avatarLabel}>
              {photoUri ? 'Cambiar foto' : 'Sacar foto de perfil'}
            </Text>
            <Text style={styles.avatarHint}>{DRIVER_PROFILE_PHOTO_HINT}</Text>
          </View>
        </TouchableOpacity>
        {errors.photo ? <Text style={styles.photoError}>{errors.photo}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nombre</Text>
          <Input
            placeholder="Como figura en tu DNI"
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              setError('firstName', undefined);
            }}
            onBlur={() => setError('firstName', validateName(firstName))}
            error={errors.firstName}
            containerStyle={styles.input}
            maxLength={100}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Apellido</Text>
          <Input
            placeholder="Apellido completo"
            value={lastName}
            onChangeText={(t) => {
              setLastName(t);
              setError('lastName', undefined);
            }}
            onBlur={() => setError('lastName', validateName(lastName))}
            error={errors.lastName}
            containerStyle={styles.input}
            maxLength={100}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Celular</Text>
          <Input
            leftElement={<Text style={styles.countryCode}>+54</Text>}
            placeholder="9 XX XXXX-XXXX"
            value={formatPhone(phoneDigits)}
            onChangeText={(t) => setPhoneDigits(t.replace(/\D/g, '').slice(0, 11))}
            keyboardType="phone-pad"
            containerStyle={styles.input}
          />
        </View>

        <View
          ref={addressFieldRef}
          collapsable={false}
          style={[styles.fieldGroup, styles.addressFieldGroup]}
        >
          <Text style={styles.fieldLabel}>Domicilio</Text>
          <View style={styles.addressBlock}>
            <Input
              placeholder="Calle, altura, ciudad…"
              value={addressLine}
              {...(addressSelection ? { selection: addressSelection } : {})}
              onChangeText={(t) => {
                setAddressLine(t);
                setAddressSelection(undefined);
                setSelectedPlace(null);
                setShowSuggestions(true);
                setError('address', undefined);
                // Multiline may grow under IME — debounced height-gated nudge (not per key).
                if (addressFocusedRef.current) {
                  scheduleScrollOnAddressType();
                }
              }}
              onBlur={() => {
                addressFocusedRef.current = false;
                lastAddressFieldHRef.current = 0;
                clearScrollRetries();
                if (
                  addressLine.trim().length > 0 &&
                  addressLine.trim().length < MIN_ADDRESS_CHARS
                ) {
                  setError('address', 'Ingresá un domicilio más completo');
                } else if (addressLine.trim().length >= MIN_ADDRESS_CHARS && !selectedPlace) {
                  setError('address', ADDRESS_PICK_REQUIRED_MSG);
                }
              }}
              onFocus={handleAddressFocus}
              error={errors.address}
              containerStyle={styles.input}
              maxLength={200}
              autoCorrect={false}
              multiline
              numberOfLines={3}
              // Parent ScrollView owns vertical gestures (multiline internal scroll steals them).
              scrollEnabled={false}
              rightElement={
                addressLine.length > 0 ? (
                  <Pressable
                    onPress={handleClearAddress}
                    accessibilityRole="button"
                    accessibilityLabel="Borrar domicilio"
                    hitSlop={10}
                    style={styles.clearAddressBtn}
                  >
                    <Ionicons name="close-circle" size={22} color={theme.colors.mediumGray} />
                  </Pressable>
                ) : null
              }
            />
            {/* One panel: loading / error / empty / list — all clipped inside the same box. */}
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
                  <Text style={styles.placesEmptyText}>{ADDRESS_EMPTY_MSG}</Text>
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
            {selectedPlace && addressZone === 'inside' ? (
              <Text style={styles.addressResolved} numberOfLines={2}>
                Ubicación lista para validar
              </Text>
            ) : null}
            {showWaitlistBanner ? (
              <View
                style={styles.waitlistBanner}
                accessibilityRole="summary"
                accessibilityLabel="Zona fuera de cobertura Lifty"
              >
                <Ionicons name="warning-outline" size={20} color={theme.colors.warning} />
                <View style={styles.waitlistCopy}>
                  <Text style={styles.waitlistTitle}>Todavía no operamos acá</Text>
                  <Text style={styles.waitlistBody}>{WAITLIST_MSG}</Text>
                  <View style={styles.waitlistActions}>
                    <TouchableOpacity
                      onPress={handleChangeAddress}
                      accessibilityRole="button"
                      accessibilityLabel="Cambiar domicilio"
                      hitSlop={8}
                    >
                      <Text style={styles.waitlistSecondary}>Cambiar domicilio</Text>
                    </TouchableOpacity>
                    <Text style={styles.waitlistPrimaryHint}>
                      Podés tocar Continuar abajo para seguir el alta igual.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setTermsAccepted(!termsAccepted)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>Acepto los términos y condiciones</Text>
        </TouchableOpacity>

        {submitError !== '' && <Text style={styles.submitError}>{submitError}</Text>}

        <Button
          title="Continuar"
          onPress={handleContinue}
          disabled={!formOk}
          loading={loading}
          variant="cta"
          style={styles.button}
        />
      </OnboardingCard>
    </>
  );

  const contentStyle = [
    styles.content,
    keyboardPad > 0 ? { paddingBottom: theme.spacing['2xl'] + keyboardPad } : null,
  ];

  const onScrollOffset = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollOffsetY.current = e.nativeEvent.contentOffset.y;
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Tu perfil" onBack={handleBack} variant="light" />
      {/*
        Android: no KeyboardAvoidingView — SO already resizes; KAV leaves a gray gap.
        iOS: padding KAV. Keep #406 dismiss modes.
        Both: scroll Domicilio into view on focus (scrollRef + measureInWindow).
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={contentStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            onScroll={onScrollOffset}
            scrollEventThrottle={16}
          >
            {formBody}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScrollOffset}
          scrollEventThrottle={16}
        >
          {formBody}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarCircleFilled: {
    borderStyle: 'solid',
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCopy: {
    flex: 1,
    gap: 2,
  },
  avatarLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  avatarHint: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  photoError: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  fieldGroup: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  addressFieldGroup: {
    zIndex: 20,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  input: {
    width: '100%',
  },
  clearAddressBtn: {
    marginTop: 2,
    padding: 2,
  },
  addressBlock: {
    width: '100%',
    zIndex: 20,
    gap: theme.spacing.xs,
  },
  placesStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  placesStatusText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  placesErrorText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  placesEmptyText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 44,
    paddingVertical: theme.spacing.xs,
  },
  useLocationText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  addressResolved: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.turquoise,
  },
  waitlistBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255, 176, 32, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 176, 32, 0.45)',
  },
  waitlistCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  waitlistTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  waitlistBody: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    lineHeight: 20,
  },
  waitlistActions: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  waitlistSecondary: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  waitlistPrimaryHint: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  suggestionsPanel: {
    width: '100%',
    marginTop: 2,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.lightGray,
    // Clip children so rows never paint outside the panel border.
    overflow: 'hidden',
    maxHeight: 240,
    zIndex: 30,
    ...theme.shadows.card,
  },
  suggestionsScroll: {
    maxHeight: 240,
    width: '100%',
  },
  suggestionsScrollContent: {
    flexGrow: 0,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 48,
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.lightGray,
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionIcon: {
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  countryCode: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
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
  checkboxLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  submitError: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: '100%',
  },
  button: {
    width: '100%',
    marginTop: theme.spacing.xs,
  },
});
