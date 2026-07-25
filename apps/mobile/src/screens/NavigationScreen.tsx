import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { RatingStars } from '../components/RatingStars';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { startTracking, stopTracking } from '../lib/location';
import { decodePolyline } from '../lib/polyline';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

export const NavigationScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const trip = useTripStore((s) => s.trip);
  const tripStatus = useTripStore((s) => s.tripStatus);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const enRouteSent = useRef(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);

  const pickupCoord: [number, number] = trip
    ? [trip.origin_lng, trip.origin_lat]
    : [-65.1833, -31.9333];

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, []);

  useEffect(() => {
    if (!trip || tripStatus !== 'accepted' || enRouteSent.current) return;
    enRouteSent.current = true;
    apiClient
      .post(`/trips/${trip.id}/en-route`)
      .then(() => setTripStatus('en_route'))
      .catch(() => {});
  }, [trip, tripStatus, setTripStatus]);

  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (!locationLat || !locationLng || !trip) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 10000) return;
    lastFetchRef.current = now;
    fetchDirections(locationLat, locationLng, trip.origin_lat, trip.origin_lng);
  }, [locationLat, locationLng, trip]);

  const fetchDirections = async (lat: number, lng: number, destLat: number, destLng: number) => {
    try {
      const res = await apiClient.get('/maps/directions', {
        params: { origin_lat: lat, origin_lng: lng, dest_lat: destLat, dest_lng: destLng },
      });
      const data = res.data?.data ?? res.data;
      setEtaMinutes(data.duration_minutes);
      setDistKm(data.distance_km);
      const coords = decodePolyline(data.polyline);
      setRouteCoords(coords);
    } catch (err) {
      if (__DEV__) console.warn('[Navigation] fetchDirections failed:', err);
    }
  };

  const openWaze = () => {
    const dest = trip;
    if (!dest) return;
    const url =
      Platform.OS === 'ios'
        ? `waze://?ll=${dest.origin_lat},${dest.origin_lng}&navigate=yes`
        : `https://waze.com/ul?ll=${dest.origin_lat},${dest.origin_lng}&navigate=yes`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir Waze'));
  };

  const openMaps = () => {
    const dest = trip;
    if (!dest) return;
    const url =
      Platform.OS === 'ios'
        ? `maps://app?daddr=${dest.origin_lat},${dest.origin_lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest.origin_lat},${dest.origin_lng}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir Maps'));
  };

  const toggleCard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  };

  const handleArrive = async () => {
    if (!trip) return;
    setLoading(true);
    try {
      await apiClient.post(`/trips/${trip.id}/arrived`);
      setTripStatus('waiting');
      navigation.navigate('WaitingPassenger');
    } catch {
      Alert.alert('Error', 'No se pudo confirmar la llegada.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <MapView
          followUserLocation
          markers={[
            {
              id: 'pickup',
              coordinate: pickupCoord,
              title: 'Pasajero',
              color: theme.colors.dangerRed,
            },
          ]}
          routeLine={routeCoords.length > 0 ? routeCoords : undefined}
        />
      </View>
      {trip?.passenger_name ? (
        <View style={styles.passengerCard}>
          <TouchableOpacity
            style={isExpanded ? styles.passengerCardExpanded : styles.passengerCardCollapsed}
            onPress={toggleCard}
            activeOpacity={0.9}
          >
            <Avatar
              uri={trip.passenger_avatar_url}
              name={trip.passenger_name}
              size={isExpanded ? 56 : 32}
            />
            {isExpanded ? (
              <View style={styles.passengerExpandedInfo}>
                <Text style={styles.passengerName}>{trip.passenger_name}</Text>
                {trip.passenger_rating != null && <RatingStars rating={trip.passenger_rating} />}
                {trip.passenger_phone ? (
                  <Text style={styles.passengerPhone}>{trip.passenger_phone}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.passengerNameSmall}>{trip.passenger_name}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.bottomCard}>
        <Text style={styles.label}>Rumbo al pasajero</Text>
        <Text style={styles.address}>{trip?.origin_address ?? 'Origen'}</Text>
        {etaMinutes !== null && distKm !== null ? (
          <Text style={styles.eta}>
            {Math.round(etaMinutes)} min · {distKm} km
          </Text>
        ) : null}
        <View style={styles.navButtons}>
          <Button
            title="Abrir en Waze"
            variant="secondary"
            onPress={openWaze}
            style={styles.navButton}
            textStyle={styles.navButtonText}
          />
          <Button
            title="Abrir en Maps"
            variant="secondary"
            onPress={openMaps}
            style={styles.navButton}
            textStyle={styles.navButtonText}
          />
        </View>
        <Button
          title="LLEGUE"
          onPress={handleArrive}
          loading={loading}
          style={styles.arrivedButton}
        />
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
    height: 528,
    backgroundColor: theme.colors.lightGray,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  address: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  eta: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  navButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  navButton: {
    flex: 1,
    height: 40,
  },
  navButtonText: {
    fontSize: theme.fontSize.sm,
  },
  arrivedButton: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  passengerCard: {
    backgroundColor: 'rgba(13, 43, 69, 0.85)',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  passengerCardCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 48,
  },
  passengerCardExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  passengerExpandedInfo: {
    flex: 1,
    gap: 2,
  },
  passengerName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  passengerNameSmall: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  passengerPhone: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
});
