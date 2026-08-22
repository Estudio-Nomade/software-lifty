import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { cancelRide, getActiveRide, getCancelPreview, getProfile } from '../api/passenger';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useDriverRoute } from '../hooks/useDriverRoute';
import { useLocation } from '../hooks/useLocation';
import { subscribeToDriverLocation, subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

const LIVE_STATUSES = ['accepted', 'en_route', 'waiting', 'in_trip'];

export function TripInProgressScreen() {
  const { navigate, replace } = useAppNavigation();
  const { current } = useLocation();
  const userId = useAuthStore((s) => s.userId);
  const activeTrip = useRideStore((s) => s.activeTrip);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const driverLocation = useRideStore((s) => s.driverLocation);
  const setDriverLocation = useRideStore((s) => s.setDriverLocation);
  const reset = useRideStore((s) => s.reset);
  const [recenterKey, setRecenterKey] = useState(0);
  const [passengerAvatar, setPassengerAvatar] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => setPassengerAvatar(p.avatar_url ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTrip) return;
    getActiveRide()
      .then((t) => {
        if (t) setActiveTrip(t);
      })
      .catch(() => {});
  }, [activeTrip, setActiveTrip]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToPassengerChannel(userId, (incoming) => {
      const status = incoming?.status;
      if (!status) return;
      if (status === 'cancelled' || status === 'cancelled_early' || status === 'cancelled_late') {
        reset();
        replace('Home');
        return;
      }
      const merged = { ...(useRideStore.getState().activeTrip ?? {}), ...incoming };
      setActiveTrip(merged);
      if (status === 'completed') {
        replace('TripComplete');
      }
    });
  }, [userId, reset, replace, setActiveTrip]);

  useEffect(() => {
    if (!activeTrip?.id) return;
    const tripId = activeTrip.id;
    const unsubscribe = subscribeToDriverLocation(tripId, (loc) => {
      const t = useRideStore.getState().activeTrip;
      if (t?.driver_id && loc?.driver_id && t.driver_id !== loc.driver_id) return;
      useRideStore.getState().setDriverLocation({
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading ?? null,
      });
    });
    return () => unsubscribe?.();
  }, [activeTrip?.id]);

  useEffect(() => {
    const live = LIVE_STATUSES.includes(activeTrip?.status ?? '');
    if (!live || !activeTrip?.driver_id) {
      setDriverLocation(null);
    }
  }, [activeTrip?.status, activeTrip?.driver_id, setDriverLocation]);

  const trip = activeTrip;

  const handleCancel = async () => {
    if (!trip?.id) {
      replace('Home');
      return;
    }
    try {
      const preview = await getCancelPreview(trip.id).catch(() => ({
        copy: '¿Confirmas la cancelación?',
        can_cancel: true,
      }));
      Alert.alert('Cancelar viaje', preview.copy, [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelRide(trip.id);
              reset();
              replace('Home');
            } catch {
              Alert.alert('Error', 'No se pudo cancelar el viaje. Intentalo de nuevo.');
            }
          },
        },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudo cancelar el viaje. Intentalo de nuevo.');
    }
  };

  const driverLat = driverLocation?.lat ?? trip?.driver_lat ?? null;
  const driverLng = driverLocation?.lng ?? trip?.driver_lng ?? null;

  const driverCoord: [number, number] | null =
    driverLat != null && driverLng != null ? [driverLng, driverLat] : null;

  const passengerCoord: [number, number] | null = current ? [current.lng, current.lat] : null;

  const routeTargetLat =
    trip?.status === 'in_trip'
      ? trip.dest_lat
      : trip?.status === 'accepted' || trip?.status === 'en_route'
        ? trip.origin_lat
        : null;
  const routeTargetLng =
    trip?.status === 'in_trip'
      ? trip.dest_lng
      : trip?.status === 'accepted' || trip?.status === 'en_route'
        ? trip.origin_lng
        : null;

  const routeCoords = useDriverRoute(driverLat, driverLng, routeTargetLat, routeTargetLng);

  const markers = [
    ...(passengerCoord
      ? [
          {
            id: 'my-location',
            coordinate: passengerCoord,
            title: 'Tu ubicación',
            color: theme.colors.deepBlue,
          },
        ]
      : []),
    ...(driverCoord
      ? [
          {
            id: 'driver',
            coordinate: driverCoord,
            title: 'Conductor',
            ...(trip?.driver_avatar_url
              ? { avatarUrl: trip.driver_avatar_url }
              : { icon: 'car' as const }),
          },
        ]
      : []),
    ...(trip?.status === 'in_trip' && trip.dest_lat != null && trip.dest_lng != null
      ? [
          {
            id: 'destination',
            coordinate: [trip.dest_lng, trip.dest_lat] as [number, number],
            title: 'Destino',
            icon: 'destination' as const,
            ...(passengerAvatar ? { avatarUrl: passengerAvatar } : {}),
          },
        ]
      : []),
  ];

  const vehicleLabel =
    [trip?.vehicle_brand, trip?.vehicle_model].filter(Boolean).join(' ') || 'Vehículo';

  const statusLabel = (() => {
    switch (trip?.status) {
      case 'waiting':
        return 'El conductor llegó';
      case 'en_route':
        return 'Tu conductor viene en camino';
      case 'accepted':
        return 'Conductor asignado';
      case 'in_trip':
        return 'Viaje en curso';
      case 'completed':
        return 'Viaje completado';
      case 'request_received':
      case 'offered':
        return 'Buscando conductor';
      default:
        return 'Viaje en curso';
    }
  })();

  const showVerificationCode = Boolean(trip?.verification_code);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapArea}>
        <PassengerMap
          centerCoordinate={driverCoord ?? passengerCoord ?? [-58.3816, -34.6037]}
          followUserLocation={false}
          userLocation={passengerCoord}
          markers={markers}
          routeLine={routeCoords.length > 0 ? routeCoords : undefined}
          recenterKey={recenterKey}
          style={styles.mapFill}
        />
      </View>

      <TouchableOpacity
        style={styles.recenterButton}
        onPress={() => setRecenterKey((k) => k + 1)}
        accessibilityLabel="Centrar mi ubicación"
      >
        <Ionicons name="locate-outline" size={22} color={theme.colors.deepBlue} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Avatar uri={trip?.driver_avatar_url} name={trip?.driver_name ?? ''} size={56} />
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.statusText}>{statusLabel}</Text>
            <Text style={styles.driverName}>{trip?.driver_name ?? 'Tu conductor'}</Text>
            <View style={styles.vehicleRow}>
              {trip?.driver_rating != null ? (
                <Text style={styles.vehicleDetail}>⭐ {trip.driver_rating}</Text>
              ) : null}
              <Text style={styles.vehicleDetail}>{vehicleLabel}</Text>
              {trip?.vehicle_plate ? (
                <Text style={styles.vehicleDetail}>{trip.vehicle_plate}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {showVerificationCode ? (
          <View style={styles.codeCard} accessibilityLabel="Código de verificación">
            <Text style={styles.codeLabel}>Código de verificación</Text>
            <Text style={styles.codeValue}>{trip?.verification_code}</Text>
            <Text style={styles.codeHint}>Dale este código al conductor para iniciar</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => navigate('Chat')} style={styles.actionBtn}>
            💬 Chat
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              if (trip?.driver_phone) {
                Linking.openURL(`tel:${trip.driver_phone}`).catch(() => {});
              }
            }}
            style={styles.actionBtn}
          >
            📞 Llamar
          </Button>
        </View>

        {trip?.status === 'accepted' ||
        trip?.status === 'en_route' ||
        trip?.status === 'waiting' ? (
          <Button variant="danger" onPress={handleCancel} style={styles.cancelBtn}>
            CANCELAR VIAJE
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  mapArea: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  mapFill: {
    flex: 1,
  },
  recenterButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
    zIndex: 10,
  },
  content: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  driverCard: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfo: { flex: 1, gap: 2 },
  statusText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  driverName: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  vehicleRow: { flexDirection: 'row', gap: theme.spacing.sm },
  vehicleDetail: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  codeCard: {
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  codeLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
  codeValue: {
    fontSize: theme.fontSize['4xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    letterSpacing: 8,
  },
  codeHint: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { flex: 1 },
  cancelBtn: { width: '100%' },
});
