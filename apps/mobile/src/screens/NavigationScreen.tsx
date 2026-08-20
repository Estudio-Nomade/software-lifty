import * as Location from 'expo-location';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
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
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useDynamicRouting } from '../hooks/useDynamicRouting';
import { useManeuverInstructions } from '../hooks/useManeuverInstructions';
import { buildTripCancelledParams } from '../lib/cancellation';
import { haversineDistance } from '../lib/geo';
import { startTracking, stopTracking } from '../lib/location';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const NavigationScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const trip = useTripStore((s) => s.trip);
  const tripStatus = useTripStore((s) => s.tripStatus);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const iconType = useVehicleStore((s) => s.iconType);
  const enRouteSent = useRef(false);
  const enRouteResolvedRef = useRef(false);
  const [nearPassenger, setNearPassenger] = useState(false);
  const [activeRoute, setActiveRoute] = useState<'primary' | 'alternative'>('primary');
  const [recenterKey, setRecenterKey] = useState(0);
  const [displayAddress, setDisplayAddress] = useState<string | null>(null);
  const [enRouteStatus, setEnRouteStatus] = useState<'pending' | 'success' | 'error'>(
    tripStatus === 'accepted' ? 'pending' : 'success',
  );

  const {
    routeCoords,
    etaMinutes,
    distKm,
    steps,
    altRouteCoords,
    altEtaMinutes,
    altDistKm,
    altSteps,
  } = useDynamicRouting(trip?.origin_lat ?? null, trip?.origin_lng ?? null);

  const isPrimary = activeRoute === 'primary';
  const activeSteps = isPrimary ? steps : altSteps;

  const { instruction } = useManeuverInstructions(activeSteps, locationLat, locationLng);

  const pickupCoord: [number, number] | null = trip ? [trip.origin_lng, trip.origin_lat] : null;

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, []);

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: trip.origin_lat, longitude: trip.origin_lng })
      .then((results) => {
        if (cancelled || !results.length) return;
        const r = results[0];
        const parts = [r.name || r.street, r.district, r.city].filter(Boolean).join(', ');
        if (parts) setDisplayAddress(parts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  useEffect(() => {
    if (!trip || tripStatus !== 'accepted' || enRouteSent.current) return;
    enRouteSent.current = true;
    apiClient
      .post(`/trips/${trip.id}/en-route`)
      .then((res) => {
        if (enRouteResolvedRef.current) return;
        enRouteResolvedRef.current = true;
        const storeTrip = useTripStore.getState().trip;
        if (storeTrip) {
          useTripStore.getState().setActiveTrip({ ...storeTrip, ...res.data });
        }
        setEnRouteStatus('success');
      })
      .catch(() => {
        if (enRouteResolvedRef.current) return;
        enRouteResolvedRef.current = true;
        setEnRouteStatus('error');
      });
  }, [trip, tripStatus]);

  useEffect(() => {
    if (!locationLat || !locationLng || !trip) return;
    const distance = haversineDistance(locationLat, locationLng, trip.origin_lat, trip.origin_lng);
    setNearPassenger(distance < 0.05);
  }, [locationLat, locationLng, trip]);

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

  const callPassenger = () => {
    const phone = trip?.passenger_phone;
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Error', 'No se pudo iniciar la llamada'),
    );
  };

  const toggleCard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  };

  const handleArrive = async () => {
    if (!trip) return;
    if (!locationLat || !locationLng) {
      Alert.alert('Error', 'No se pudo obtener tu ubicacion.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post(`/trips/${trip.id}/arrived`, {
        lat: locationLat,
        lng: locationLng,
      });
      const storeTrip = useTripStore.getState().trip;
      if (storeTrip) {
        useTripStore.getState().setActiveTrip({ ...storeTrip, ...res.data });
      }
      navigation.navigate('WaitingPassenger');
    } catch (err: any) {
      if (__DEV__) console.error('[handleArrive] error:', err?.message ?? err);
      const isTokenExpired =
        err?.code === 'TOKEN_REQUIRED' ||
        err?.code === 'TOKEN_EXPIRED' ||
        err?.error?.code === 'TOKEN_REQUIRED' ||
        err?.error?.code === 'TOKEN_EXPIRED';
      const errorMsg =
        err?.error?.code === 'TOO_FAR_FROM_PICKUP'
          ? (err?.error?.message ??
            'Debes estar a menos de 50 metros del pasajero para confirmar la llegada')
          : (err?.error?.message ?? 'No se pudo confirmar la llegada.');
      const message = isTokenExpired ? 'Tu sesion expiro. Inicia sesion nuevamente.' : errorMsg;
      Alert.alert('Error', message, [
        {
          text: 'OK',
          onPress: () => {
            if (isTokenExpired) {
              useTripStore.getState().clearTrip();
              navigation.replace('Welcome');
            }
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryEnRoute = async () => {
    if (!trip) return;
    setEnRouteStatus('pending');
    try {
      const res = await apiClient.post(`/trips/${trip.id}/en-route`);
      const storeTrip = useTripStore.getState().trip;
      if (storeTrip) {
        useTripStore.getState().setActiveTrip({ ...storeTrip, ...res.data });
      }
      setEnRouteStatus('success');
    } catch {
      setEnRouteStatus('error');
    }
  };

  const handleRecenter = () => {
    setRecenterKey((k) => k + 1);
  };

  const handleCancelTrip = () => {
    if (!trip) return;
    Alert.alert('Cancelar viaje', 'El pasajero sera notificado. Confirmas?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Si, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiClient.post(`/trips/${trip.id}/cancel`, {
              reason: 'driver_cancel',
            });
            const payload = res.data?.data ?? res.data;
            clearTrip();
            navigation.replace('TripCancelled', buildTripCancelledParams(payload));
          } catch (err: any) {
            Alert.alert('Error', err?.error?.message ?? 'No se pudo cancelar el viaje.');
          }
        },
      },
    ]);
  };

  const isPrimaryNav = activeRoute === 'primary';
  const activeCoords = isPrimaryNav ? routeCoords : altRouteCoords;
  const activeEta = isPrimaryNav ? etaMinutes : altEtaMinutes;
  const activeDist = isPrimaryNav ? distKm : altDistKm;
  const altCoords = isPrimaryNav ? altRouteCoords : routeCoords;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <MapView
          followUserLocation
          recenterKey={recenterKey}
          centerCoordinate={
            trip
              ? [trip.origin_lng, trip.origin_lat]
              : locationLat != null && locationLng != null
                ? [locationLng, locationLat]
                : [0, 0]
          }
          userLocation={
            locationLat != null && locationLng != null ? [locationLng, locationLat] : null
          }
          markers={[
            ...(pickupCoord
              ? [
                  {
                    id: 'pickup',
                    coordinate: pickupCoord,
                    title: 'Pasajero',
                    ...(trip?.passenger_avatar_url
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
          routeLine={activeCoords.length > 0 ? activeCoords : undefined}
          alternativeRouteLine={altCoords.length > 0 ? altCoords : undefined}
        />
      </View>
      <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
        <Text style={styles.recenterButtonText}>⟳</Text>
      </TouchableOpacity>
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
        <ScrollView
          style={styles.bottomCardContent}
          contentContainerStyle={styles.bottomCardInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={styles.label}>Rumbo al pasajero</Text>
          <Text style={styles.address}>{displayAddress ?? trip?.origin_address ?? 'Origen'}</Text>
          {trip?.pickup_instructions ? (
            <View style={styles.instructionsPill}>
              <Text style={styles.instructionsLabel}>📝</Text>
              <Text style={styles.instructionsText}>{trip.pickup_instructions}</Text>
            </View>
          ) : null}
          {activeEta !== null && activeDist !== null ? (
            <View style={styles.etaContainer}>
              <View style={styles.etaBox}>
                <Text style={styles.etaValue}>{Math.round(activeEta)}</Text>
                <Text style={styles.etaUnit}>min</Text>
              </View>
              <View style={styles.etaDivider} />
              <View style={styles.etaBox}>
                <Text style={styles.etaValue}>
                  {activeDist < 1 ? Math.round(activeDist * 1000) : activeDist}
                </Text>
                <Text style={styles.etaUnit}>{activeDist < 1 ? 'm' : 'km'}</Text>
              </View>
            </View>
          ) : null}
          {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
          <View style={styles.commsButtons}>
            <Button
              title="📞 Llamar"
              variant="secondary"
              onPress={callPassenger}
              disabled={!trip?.passenger_phone}
              style={styles.commsButton}
              textStyle={styles.commsButtonText}
            />
            <Button
              title="💬 Chat"
              variant="secondary"
              onPress={() => navigation.navigate('Chat')}
              style={styles.commsButton}
              textStyle={styles.commsButtonText}
            />
          </View>
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
          {enRouteStatus === 'pending' ? (
            <>
              <Text style={styles.enRouteStatusText}>Preparando navegacion...</Text>
              <Button
                title="LLEGUE"
                onPress={() => {}}
                loading={true}
                disabled={true}
                variant="primary"
                style={styles.arrivedButton}
              />
            </>
          ) : enRouteStatus === 'error' ? (
            <>
              <Text style={styles.enRouteErrorText}>Error al conectar con el servidor</Text>
              <Button
                title="Reintentar"
                onPress={handleRetryEnRoute}
                variant="danger"
                style={styles.arrivedButton}
              />
            </>
          ) : (
            <>
              {nearPassenger && (
                <Text style={styles.nearPassengerText}>Estas cerca del pasajero</Text>
              )}
              <Button
                title="LLEGUE"
                onPress={handleArrive}
                loading={loading}
                disabled={!nearPassenger}
                variant={nearPassenger ? 'cta' : 'primary'}
                style={styles.arrivedButton}
              />
            </>
          )}
          <TouchableOpacity onPress={handleCancelTrip} style={styles.cancelLinkWrap}>
            <Text style={styles.cancelLink}>Cancelar viaje</Text>
          </TouchableOpacity>
        </ScrollView>
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
    maxHeight: SCREEN_HEIGHT * 0.48,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomCardContent: {
    flexGrow: 0,
  },
  bottomCardInner: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.dimensions.tabBarHeight + theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cancelLinkWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  cancelLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.dangerRed,
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
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  etaBox: {
    alignItems: 'center',
    minWidth: 72,
  },
  etaValue: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  etaUnit: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    marginTop: -2,
  },
  etaDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.mediumGray,
    opacity: 0.3,
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
  commsButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  commsButton: {
    flex: 1,
    height: 40,
  },
  commsButtonText: {
    fontSize: theme.fontSize.sm,
  },
  arrivedButton: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  instructionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  instructionsLabel: {
    fontSize: theme.fontSize.xs,
  },
  instructionsText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.deepBlue,
    flex: 1,
  },
  nearPassengerText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  enRouteStatusText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  enRouteErrorText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.dangerRed,
    textAlign: 'center',
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
