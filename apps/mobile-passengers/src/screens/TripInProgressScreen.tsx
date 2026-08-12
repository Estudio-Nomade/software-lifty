import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { cancelRide, getActiveRide } from '../api/passenger';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocationStore } from '../store/locationStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export function TripInProgressScreen() {
  const { navigate } = useAppNavigation();
  const current = useLocationStore((s) => s.current);
  const activeTrip = useRideStore((s) => s.activeTrip);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);

  useEffect(() => {
    if (activeTrip) return;
    getActiveRide()
      .then((t) => {
        if (t) setActiveTrip(t);
      })
      .catch(() => {});
  }, [activeTrip, setActiveTrip]);

  const trip = activeTrip;

  const handleCancel = async () => {
    if (trip?.id) {
      await cancelRide(trip.id).catch(() => {});
    }
    navigate('Home');
  };

  const driverCoord: [number, number] | null =
    trip?.driver_lat != null && trip?.driver_lng != null
      ? [trip.driver_lng, trip.driver_lat]
      : null;

  const vehicleLabel =
    [trip?.vehicle_brand, trip?.vehicle_model].filter(Boolean).join(' ') || 'Vehículo';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapArea}>
        <PassengerMap
          centerCoordinate={
            driverCoord ?? (current ? [current.lng, current.lat] : [-58.3816, -34.6037])
          }
          followUserLocation={false}
          style={styles.mapFill}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Ionicons name="person" size={28} color={theme.colors.mediumGray} />
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.statusText}>Tu conductor viene en camino</Text>
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

        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => navigate('Chat')} style={styles.actionBtn}>
            💬 Chat
          </Button>
          <Button variant="secondary" onPress={() => {}} style={styles.actionBtn}>
            📞 Llamar
          </Button>
        </View>

        <Button variant="danger" onPress={handleCancel} style={styles.cancelBtn}>
          CANCELAR VIAJE
        </Button>
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
  actions: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { flex: 1 },
  cancelBtn: { width: '100%' },
});
