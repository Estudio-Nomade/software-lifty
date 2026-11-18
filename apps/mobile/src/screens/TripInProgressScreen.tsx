import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { ApiError } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CompleteExceptionModal } from '../components/CompleteExceptionModal';
import { MapView } from '../components/MapView';
import { RatingStars } from '../components/RatingStars';
import { Snackbar, type SnackbarTone } from '../components/feedback/Snackbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useDynamicRouting } from '../hooks/useDynamicRouting';
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
import { COMPLETE_EXCEPTION_MAX_M, type CompleteExceptionReason } from '../lib/completeException';
import {
  COMPLETE_GPS_ACCURACY_MAX_M,
  getCurrentPosition,
  isGpsAccuracyTooLow,
  startTracking,
  stopTracking,
} from '../lib/location';
import { mergeTripUpdate } from '../lib/mergeTrip';
import { formatPinDistanceLabel, metersToDestPin, pinDistanceTone } from '../lib/pinDistance';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

const COMPLETE_GPS_TIMEOUT_MS = 15_000;

type ExceptionSheetState = {
  open: boolean;
  lat: number;
  lng: number;
  accuracy: number | null;
  distanceMeters: number | null;
  noteRequired: boolean;
};

function apiErrorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.code;
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; error?: { code?: unknown } };
    if (typeof e.code === 'string') return e.code;
    if (typeof e.error?.code === 'string') return e.error.code;
  }
  return undefined;
}

function apiErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; error?: { message?: unknown } };
    if (typeof e.error?.message === 'string') return e.error.message;
    if (typeof e.message === 'string') return e.message;
  }
  return undefined;
}

export const TripInProgressScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const trip = useTripStore((s) => s.trip);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const iconType = useVehicleStore((s) => s.iconType);
  const [completing, setCompleting] = React.useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [exceptionSheet, setExceptionSheet] = useState<ExceptionSheetState | null>(null);
  const [completeError, setCompleteError] = useState<{
    title: string;
    message: string;
    tone: SnackbarTone;
    distanceMeters: number | null;
  } | null>(null);

  const { routeCoords, etaMinutes, distKm, steps, altRouteCoords } = useDynamicRouting(
    trip?.dest_lat ?? null,
    trip?.dest_lng ?? null,
  );

  const totalDistKmRef = useRef<number | null>(trip?.distance_km ?? null);

  useEffect(() => {
    if (!totalDistKmRef.current && distKm !== null) {
      totalDistKmRef.current = distKm;
    }
  }, [distKm]);

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, []);

  // If the store trip lost passenger display fields (bare mutation payloads),
  // refresh once from GET /trips/:id which joins users.full_name.
  useEffect(() => {
    if (!trip?.id) return;
    if (trip.passenger_name) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/trips/${trip.id}`);
        if (cancelled) return;
        const merged = mergeTripUpdate(useTripStore.getState().trip, res.data);
        if (merged) useTripStore.getState().setActiveTrip(merged);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip?.id, trip?.passenger_name]);

  const navigateTripComplete = (responseData: unknown) => {
    const storeTrip = useTripStore.getState().trip;
    const merged = mergeTripUpdate(storeTrip, responseData);
    if (merged) {
      useTripStore.getState().setActiveTrip(merged);
    }
    const tripData =
      mergeTripUpdate(null, responseData) ??
      (responseData as { data?: unknown } | null)?.data ??
      responseData;
    const fare = tripData as {
      total_fare?: number;
      platform_fee?: number;
      driver_earnings?: number;
      tip_amount?: number;
    } | null;
    navigation.navigate('TripComplete', {
      amount: String(fare?.total_fare ?? 2500),
      commission: String(fare?.platform_fee ?? 500),
      driverEarnings: String(fare?.driver_earnings ?? 2000),
      tipAmount: String(fare?.tip_amount ?? 0),
    });
  };

  const handleCompleteError = (
    err: unknown,
    locked: {
      lat: number;
      lng: number;
      accuracy: number | null;
    },
  ) => {
    const code = apiErrorCode(err);
    if (code === 'TOKEN_REQUIRED' || code === 'TOKEN_EXPIRED') {
      Alert.alert('Sesion expirada', 'Tu sesion ha expirado. Inicia sesion nuevamente.', [
        {
          text: 'OK',
          onPress: () => {
            useTripStore.getState().clearTrip();
            navigation.replace('Welcome');
          },
        },
      ]);
      return;
    }

    const distanceMeters = metersToDestPin(locked.lat, locked.lng, trip?.dest_lat, trip?.dest_lng);

    if (code === 'EXCEPTION_REQUIRED' || code === 'EXCEPTION_NOTE_REQUIRED') {
      setCompleteError(null);
      setExceptionSheet({
        open: true,
        lat: locked.lat,
        lng: locked.lng,
        accuracy: locked.accuracy,
        distanceMeters,
        noteRequired: code === 'EXCEPTION_NOTE_REQUIRED',
      });
      return;
    }

    if (code === 'GPS_ACCURACY') {
      setCompleteError({
        title: 'GPS impreciso',
        message: 'Esperá un segundo y volvé a intentar. La señal todavía no es confiable.',
        tone: 'warning',
        distanceMeters: null,
      });
      return;
    }

    if (code === 'TOO_FAR_FROM_DESTINATION') {
      setCompleteError({
        title: 'Necesitás estar más cerca del destino',
        message: `Acercate al pin del destino para finalizar (máx. ~${COMPLETE_EXCEPTION_MAX_M} m).`,
        tone: 'warning',
        distanceMeters,
      });
      return;
    }

    setCompleteError({
      title: 'No se pudo finalizar el viaje',
      message: apiErrorMessage(err) || 'No se pudo finalizar el viaje',
      tone: 'error',
      distanceMeters: null,
    });
  };

  const handleCompleteTrip = async () => {
    if (!trip?.id || completing) return;
    setCompleting(true);
    setCompleteError(null);
    let locked: { lat: number; lng: number; accuracy: number | null } | null = null;
    try {
      const gotFresh = await Promise.race([
        getCurrentPosition(),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), COMPLETE_GPS_TIMEOUT_MS);
        }),
      ]);

      const { lat, lng, accuracy } = useLocationStore.getState();
      if (!gotFresh || lat == null || lng == null) {
        setCompleteError({
          title: 'No se pudo finalizar el viaje',
          message: 'No pudimos obtener tu ubicación. Activá el GPS e intentá de nuevo.',
          tone: 'error',
          distanceMeters: null,
        });
        return;
      }

      // Known-bad fix: do not POST (avoids rate-limit burn + false TOO_FAR copy).
      // null accuracy = unknown → allow POST (BE / distance still apply).
      if (isGpsAccuracyTooLow(accuracy, COMPLETE_GPS_ACCURACY_MAX_M)) {
        setCompleteError({
          title: 'GPS impreciso',
          message: 'Esperá un segundo y volvé a intentar. La señal todavía no es confiable.',
          tone: 'warning',
          distanceMeters: null,
        });
        return;
      }

      locked = { lat, lng, accuracy: accuracy ?? null };
      const response = await apiClient.post(`/trips/${trip.id}/complete`, {
        lat: locked.lat,
        lng: locked.lng,
        ...(locked.accuracy != null ? { gps_accuracy_m: locked.accuracy } : {}),
      });
      navigateTripComplete(response.data);
    } catch (err: unknown) {
      if (locked) {
        handleCompleteError(err, locked);
      } else {
        setCompleteError({
          title: 'No se pudo finalizar el viaje',
          message: apiErrorMessage(err) || 'No se pudo finalizar el viaje',
          tone: 'error',
          distanceMeters: null,
        });
      }
    } finally {
      setCompleting(false);
    }
  };

  const handleExceptionSubmit = async (reason: CompleteExceptionReason, note?: string) => {
    if (!trip?.id || !exceptionSheet || completing) return;
    setCompleting(true);
    setCompleteError(null);
    const locked = {
      lat: exceptionSheet.lat,
      lng: exceptionSheet.lng,
      accuracy: exceptionSheet.accuracy,
    };
    try {
      const response = await apiClient.post(`/trips/${trip.id}/complete`, {
        lat: locked.lat,
        lng: locked.lng,
        ...(locked.accuracy != null ? { gps_accuracy_m: locked.accuracy } : {}),
        exception_reason: reason,
        ...(reason === 'other' || note ? { exception_note: note } : {}),
      });
      setExceptionSheet(null);
      navigateTripComplete(response.data);
    } catch (err: unknown) {
      handleCompleteError(err, locked);
    } finally {
      setCompleting(false);
    }
  };

  const handleRecenter = () => {
    setRecenterKey((k) => k + 1);
  };

  const progress =
    totalDistKmRef.current && distKm !== null
      ? Math.min(
          100,
          Math.max(0, ((totalDistKmRef.current - distKm) / totalDistKmRef.current) * 100),
        )
      : trip?.distance_km
        ? 0
        : 55;

  const { instruction } = useManeuverInstructions(steps, locationLat, locationLng);

  const metersToPin = metersToDestPin(locationLat, locationLng, trip?.dest_lat, trip?.dest_lng);
  const pinTone = metersToPin != null ? pinDistanceTone(metersToPin) : null;
  const pinDistanceColor =
    pinTone === 'ok'
      ? theme.colors.mediumGray
      : pinTone === 'warn'
        ? theme.colors.amber
        : pinTone === 'far'
          ? theme.colors.dangerRed
          : theme.colors.mediumGray;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <MapView
          followUserLocation
          recenterKey={recenterKey}
          onFollowingChange={setIsFollowingUser}
          centerCoordinate={
            trip
              ? [trip.dest_lng, trip.dest_lat]
              : locationLat != null && locationLng != null
                ? [locationLng, locationLat]
                : [0, 0]
          }
          userLocation={
            locationLat != null && locationLng != null ? [locationLng, locationLat] : null
          }
          markers={[
            ...(trip
              ? [
                  {
                    id: 'destination',
                    coordinate: [trip.dest_lng, trip.dest_lat] as [number, number],
                    title: 'Destino',
                    ...(trip.passenger_avatar_url
                      ? { avatarUrl: trip.passenger_avatar_url }
                      : { icon: 'person' as const }),
                  },
                ]
              : []),
            ...(locationLat != null && locationLng != null
              ? [
                  {
                    id: 'my-location',
                    coordinate: [locationLng, locationLat] as [number, number],
                    title: 'Mi ubicación',
                    icon: iconType ?? 'car',
                  },
                ]
              : []),
          ]}
          routeLine={routeCoords.length > 0 ? routeCoords : undefined}
          alternativeRouteLine={altRouteCoords.length > 0 ? altRouteCoords : undefined}
        />
      </View>
      <TouchableOpacity
        style={[styles.recenterButton, isFollowingUser && styles.recenterButtonInactive]}
        onPress={handleRecenter}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Centrar mapa en mi ubicación"
      >
        <Ionicons
          name="navigate"
          size={24}
          color={isFollowingUser ? theme.colors.mediumGray : theme.colors.turquoise}
        />
      </TouchableOpacity>
      <View style={styles.bottomCard}>
        <View style={styles.passengerCard}>
          <Avatar
            uri={trip?.passenger_avatar_url ?? null}
            name={trip?.passenger_name ?? 'Pasajero'}
            size={56}
          />
          <View style={styles.passengerInfo}>
            <Text style={styles.passengerLabel}>Llevando a</Text>
            <View style={styles.passengerNameRow}>
              <Text style={styles.passengerName} numberOfLines={1}>
                {trip?.passenger_name ?? 'Pasajero'}
              </Text>
              {trip?.passenger_rating != null ? (
                <RatingStars rating={trip.passenger_rating} />
              ) : null}
            </View>
            <Text style={styles.passengerDest} numberOfLines={1}>
              {trip?.dest_address ?? 'Destino'}
            </Text>
            {etaMinutes !== null && distKm !== null ? (
              <Text style={styles.passengerEta}>
                ~{Math.round(etaMinutes)} min ·{' '}
                {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm} km`}
              </Text>
            ) : null}
          </View>
        </View>
        {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        {metersToPin != null ? (
          <Text
            style={[styles.pinDistance, { color: pinDistanceColor }]}
            accessibilityLabel={`Distancia al pin ${metersToPin} metros`}
          >
            {formatPinDistanceLabel(metersToPin)}
          </Text>
        ) : null}
        <Button
          title="FINALIZAR VIAJE"
          onPress={handleCompleteTrip}
          loading={completing}
          style={styles.button}
        />
        <Button
          title="💬 Chat"
          variant="secondary"
          onPress={() => navigation.navigate('Chat')}
          style={styles.button}
        />
        <TouchableOpacity
          onPress={() => {
            if (!trip) return;
            const destLabel = encodeURIComponent(trip.dest_address ?? 'Destino');
            const url = Platform.select({
              ios: `maps://app?daddr=${trip.dest_lat},${trip.dest_lng}&dirflg=d`,
              android: `geo:0,0?q=${trip.dest_lat},${trip.dest_lng}(${destLabel})`,
              default: `https://www.google.com/maps/dir/?api=1&destination=${trip.dest_lat},${trip.dest_lng}`,
            });
            Linking.openURL(url!).catch(() => {});
          }}
        >
          <Text style={styles.mapsLink}>Abrir en Maps</Text>
        </TouchableOpacity>
      </View>

      <CompleteExceptionModal
        visible={exceptionSheet?.open === true}
        distanceMeters={exceptionSheet?.distanceMeters ?? null}
        noteRequired={exceptionSheet?.noteRequired ?? false}
        submitting={completing}
        onClose={() => {
          if (completing) return;
          setExceptionSheet(null);
        }}
        onSubmit={handleExceptionSubmit}
      />

      {completeError ? (
        <Snackbar
          visible={completeError !== null}
          title={completeError.title}
          message={completeError.message}
          tone={completeError.tone}
          distanceMeters={completeError.distanceMeters}
          onDismiss={() => setCompleteError(null)}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  mapArea: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
  },
  bottomCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    flexShrink: 0,
  },
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  passengerInfo: {
    flex: 1,
    gap: 2,
  },
  passengerLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  passengerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  passengerName: {
    flexShrink: 1,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  passengerDest: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  passengerEta: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  instruction: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    backgroundColor: 'rgba(0, 194, 179, 0.08)',
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surfaceMuted,
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.turquoise,
  },
  pinDistance: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  button: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  mapsLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  recenterButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: theme.spacing['2xl'],
    height: theme.spacing['2xl'],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
    zIndex: 10,
  },
  recenterButtonInactive: {
    opacity: 0.55,
  },
  recenterButtonText: {
    fontSize: 20,
    color: theme.colors.deepBlue,
  },
});
