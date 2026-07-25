import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
import type { ManeuverStep } from '../hooks/useManeuverInstructions';
import { startTracking, stopTracking } from '../lib/location';
import { decodePolyline } from '../lib/polyline';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

export const TripInProgressScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const trip = useTripStore((s) => s.trip);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const [completing, setCompleting] = React.useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);
  const totalDistKmRef = useRef<number | null>(trip?.distance_km ?? null);
  const [steps, setSteps] = useState<ManeuverStep[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDirections = useCallback(async () => {
    if (!locationLat || !locationLng || !trip) return;
    try {
      const res = await apiClient.get('/maps/directions', {
        params: {
          origin_lat: locationLat,
          origin_lng: locationLng,
          dest_lat: trip.dest_lat,
          dest_lng: trip.dest_lng,
        },
      });
      const data = res.data?.data ?? res.data;
      setEtaMinutes(data.duration_minutes);
      setDistKm(data.distance_km);
      if (!totalDistKmRef.current && data.distance_km) totalDistKmRef.current = data.distance_km;
      const coords = decodePolyline(data.polyline);
      setRouteCoords(coords);
      setSteps(data.steps ?? []);
    } catch (err) {
      if (__DEV__) console.warn('[TripInProgress] fetchDirections failed:', err);
    }
  }, [locationLat, locationLng, trip]);

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, []);

  useEffect(() => {
    fetchDirections();
  }, [fetchDirections]);

  useEffect(() => {
    intervalRef.current = setInterval(fetchDirections, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDirections]);

  const handleCompleteTrip = async () => {
    if (!trip?.id) return;
    setCompleting(true);
    try {
      const response = await apiClient.post(`/trips/${trip.id}/complete`);
      const tripData = response.data?.data ?? response.data;
      setTripStatus('completed');
      navigation.navigate('TripComplete', {
        amount: String(tripData?.total_fare ?? 2500),
        commission: String(tripData?.platform_fee ?? 500),
        driverEarnings: String(tripData?.driver_earnings ?? 2000),
      });
    } catch {
      navigation.navigate('TripComplete');
    } finally {
      setCompleting(false);
    }
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
        <MapView followUserLocation routeLine={routeCoords.length > 0 ? routeCoords : undefined} />
      </View>
      <View style={styles.bottomCard}>
        <Text style={styles.label}>En viaje</Text>
        <Text style={styles.destination}>{trip?.dest_address ?? 'Destino'}</Text>
        {etaMinutes !== null && distKm !== null ? (
          <Text style={styles.eta}>
            ~{Math.round(etaMinutes)} min · {distKm} km
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
});
