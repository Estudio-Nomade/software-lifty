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
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { RatingStars } from '../components/RatingStars';
import { Snackbar, type SnackbarTone } from '../components/feedback/Snackbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useDynamicRouting } from '../hooks/useDynamicRouting';
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
import { haversineDistance } from '../lib/geo';
import { startTracking, stopTracking } from '../lib/location';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

export const TripInProgressScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const trip = useTripStore((s) => s.trip);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const iconType = useVehicleStore((s) => s.iconType);
  const [completing, setCompleting] = React.useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
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

  const handleCompleteTrip = async () => {
    if (!trip?.id) return;
    setCompleting(true);
    try {
      const response = await apiClient.post(`/trips/${trip.id}/complete`, {
        lat: locationLat,
        lng: locationLng,
      });
      const tripData = response.data?.data ?? response.data;
      const storeTrip = useTripStore.getState().trip;
      if (storeTrip) {
        useTripStore.getState().setActiveTrip({ ...storeTrip, ...tripData });
      }
      navigation.navigate('TripComplete', {
        amount: String(tripData?.total_fare ?? 2500),
        commission: String(tripData?.platform_fee ?? 500),
        driverEarnings: String(tripData?.driver_earnings ?? 2000),
        tipAmount: String(tripData?.tip_amount ?? 0),
      });
    } catch (err: any) {
      const isTokenExpired =
        err?.code === 'TOKEN_REQUIRED' ||
        err?.code === 'TOKEN_EXPIRED' ||
        err?.error?.code === 'TOKEN_REQUIRED' ||
        err?.error?.code === 'TOKEN_EXPIRED';
      if (isTokenExpired) {
        Alert.alert('Sesion expirada', 'Tu sesion ha expirado. Inicia sesion nuevamente.', [
          {
            text: 'OK',
            onPress: () => {
              useTripStore.getState().clearTrip();
              navigation.replace('Welcome');
            },
          },
        ]);
        setCompleting(false);
        return;
      }
      const code = err?.error?.code;
      const isTooFar = code === 'TOO_FAR_FROM_DESTINATION';
      let distanceMeters: number | null = null;
      if (
        isTooFar &&
        locationLat != null &&
        locationLng != null &&
        trip?.dest_lat != null &&
        trip?.dest_lng != null
      ) {
        distanceMeters = Math.round(
          haversineDistance(locationLat, locationLng, trip.dest_lat, trip.dest_lng) * 1000,
        );
      }
      setCompleteError({
        title: isTooFar ? 'Todavía no llegaste al destino' : 'No se pudo finalizar el viaje',
        message: isTooFar
          ? 'Acercate al pin del destino. Necesitas estar a menos de 50 metros para finalizar.'
          : err?.error?.message || err?.message || 'No se pudo finalizar el viaje',
        tone: isTooFar ? 'warning' : 'error',
        distanceMeters,
      });
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
    backgroundColor: theme.colors.white,
  },
  mapArea: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  bottomCard: {
    backgroundColor: theme.colors.white,
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
    backgroundColor: theme.colors.lightGray,
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.turquoise,
  },
  button: {
    width: 327,
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
    backgroundColor: theme.colors.white,
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
