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
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useDynamicRouting } from '../hooks/useDynamicRouting';
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
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
      const message = err?.error?.message || err?.message || 'No se pudo finalizar el viaje';
      Alert.alert('Error', message);
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
                    icon: 'person' as const,
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
      <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
        <Text style={styles.recenterButtonText}>⟳</Text>
      </TouchableOpacity>
      <View style={styles.bottomCard}>
        <Text style={styles.label}>En viaje</Text>
        <Text style={styles.destination}>{trip?.dest_address ?? 'Destino'}</Text>
        {etaMinutes !== null && distKm !== null ? (
          <Text style={styles.eta}>
            ~{Math.round(etaMinutes)} min ·{' '}
            {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm} km`}
          </Text>
        ) : null}
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
  label: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  destination: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  eta: {
    fontSize: theme.fontSize.lg,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  recenterButtonText: {
    fontSize: 20,
    color: theme.colors.deepBlue,
  },
});
