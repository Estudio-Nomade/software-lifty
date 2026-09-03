import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cancelRide } from '../api/passenger';
import type { Trip } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

const formatCurrency = (value: number | null | undefined) =>
  value == null ? '—' : `$${value.toLocaleString('es-AR')}`;

const formatDistance = (value: number | null | undefined) => {
  if (value == null) return '';
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value} km`;
};

export function TripRequestScreen() {
  const navigation = useAppNavigation();
  const { userId } = useAuthStore();
  const { activeTrip, setActiveTrip } = useRideStore();
  const [trip, setTrip] = useState<Trip | null>(activeTrip);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (activeTrip) {
      setTrip(activeTrip);
    }
  }, [activeTrip]);

  useEffect(() => {
    if (!userId || !trip?.id) return;

    const unsubscribe = subscribeToPassengerChannel(userId, async (updatedTrip: any) => {
      if (updatedTrip?.id !== trip.id) return;

      if (updatedTrip.status === 'cancelled' || updatedTrip.status === 'rejected') {
        Alert.alert('Viaje cancelado', 'El viaje fue cancelado.');
        navigation.replace('Home');
        return;
      }

      if (
        updatedTrip.status === 'accepted' ||
        updatedTrip.status === 'en_route' ||
        updatedTrip.status === 'waiting'
      ) {
        setActiveTrip(updatedTrip as Trip);
        navigation.replace('TripInProgress');
      }
    });

    return () => unsubscribe?.();
  }, [userId, trip?.id, navigation, setActiveTrip]);

  const handleConfirm = async () => {
    if (!trip?.id || confirming) return;
    setConfirming(true);

    try {
      setActiveTrip(trip);
      navigation.replace('TripInProgress');
    } catch (error) {
      Alert.alert('Error', 'No se pudo confirmar el viaje. Inténtalo nuevamente.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!trip?.id) return;

    setLoading(true);
    try {
      await cancelRide(trip.id);
      navigation.replace('Home');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cancelar el viaje.');
    } finally {
      setLoading(false);
    }
  };

  if (!trip) {
    return (
      <View style={styles.center}>
        <Ionicons name="car-outline" size={48} color={theme.colors.mediumGray} />
        <Text style={styles.emptyText}>No hay viaje activo</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Confirmar viaje</Text>
        <Text style={styles.subtitle}>Revisa los detalles antes de confirmar</Text>
      </View>

      <Card style={styles.driverCard}>
        <View style={styles.driverRow}>
          <Avatar uri={trip.driver_avatar_url} name={trip.driver_name || 'Conductor'} size={56} />
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{trip.driver_name || 'Conductor'}</Text>
            {trip.driver_rating != null && (
              <Text style={styles.ratingText}>⭐ {trip.driver_rating.toFixed(1)}</Text>
            )}
            {(trip.vehicle_brand || trip.vehicle_model) && (
              <Text style={styles.vehicleText}>
                {trip.vehicle_brand} {trip.vehicle_model} • {trip.vehicle_plate}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.routePoint}>
          <Text style={styles.routeIcon}>📍</Text>
          <Text style={styles.routeText}>{trip.origin_address ?? 'Origen'}</Text>
        </View>

        <View style={styles.routeLine}>
          <Text style={styles.distanceText}>
            {formatDistance(trip.distance_km)} • ~{trip.duration_minutes} min
          </Text>
        </View>

        <View style={styles.routePoint}>
          <Text style={styles.routeIcon}>📍</Text>
          <Text style={styles.routeText}>{trip.dest_address ?? 'Destino'}</Text>
        </View>
      </Card>

      <Card style={styles.priceCard}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Total del viaje</Text>
          <Text style={styles.priceValue}>{formatCurrency(trip.total_fare)}</Text>
        </View>

        {(trip.platform_fee ?? 0) > 0 ? (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Comisión Lifty (
              {Math.round(((trip.platform_fee ?? 0) / (trip.total_fare ?? 1)) * 100)}
              %)
            </Text>
            <Text style={styles.commissionValue}>-{formatCurrency(trip.platform_fee)}</Text>
          </View>
        ) : (
          <View style={styles.promoBadge}>
            <Text style={styles.promoText}>¡Sin comisión!</Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total a pagar</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency((trip.total_fare ?? 0) - (trip.platform_fee ?? 0))}
          </Text>
        </View>
      </Card>

      <View style={styles.buttonContainer}>
        <Button
          variant="cta"
          onPress={handleConfirm}
          loading={confirming}
          style={styles.confirmButton}
        >
          CONFIRMAR VIAJE
        </Button>
        <Button
          variant="secondary"
          onPress={handleCancel}
          disabled={loading}
          style={styles.cancelButton}
        >
          Cancelar
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  driverCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  driverInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  driverName: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    flexShrink: 1,
  },
  ratingText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.amber,
  },
  vehicleText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  routeIcon: {
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.xs,
    color: theme.colors.primary,
  },
  routeText: {
    flex: 1,
    flexShrink: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
    lineHeight: 22,
  },
  routeLine: {
    height: theme.spacing.lg,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginLeft: theme.spacing.sm + 2,
  },
  distanceText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
  priceCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    width: '100%',
  },
  priceLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  priceValue: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  commissionValue: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.dangerRed,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    marginTop: theme.spacing.xs,
  },
  totalLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  totalAmount: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  promoBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    alignSelf: 'flex-start',
  },
  promoText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  buttonContainer: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  confirmButton: {
    width: '100%',
  },
  cancelButton: {
    width: '100%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
});
