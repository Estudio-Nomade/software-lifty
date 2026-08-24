import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { cancelRide, getRideDetails, retryRide } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export const SEARCH_TIMEOUT_MS = 300_000;

const LIVE_STATUSES = new Set(['accepted', 'en_route', 'waiting', 'in_trip']);

export function ConnectingDriverScreen() {
  const { navigate, replace } = useAppNavigation();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const userId = useAuthStore((s) => s.userId);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const [timedOut, setTimedOut] = useState(false);
  const [noDrivers, setNoDrivers] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const proceedToTrip = useCallback(
    async (id: string, statusHint?: string) => {
      if (statusHint && !LIVE_STATUSES.has(statusHint)) return;
      const full = await getRideDetails(id).catch(() => null);
      if (!full || !LIVE_STATUSES.has(full.status)) return;
      setActiveTrip(full);
      replace('TripInProgress');
    },
    [setActiveTrip, replace],
  );

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToPassengerChannel(userId, async (trip: any) => {
      if (!tripId || trip?.id !== tripId) return;
      if (
        trip?.status === 'cancelled' ||
        trip?.status === 'cancelled_early' ||
        trip?.status === 'cancelled_late'
      ) {
        setTimedOut(true);
        return;
      }
      if (trip?.drivers_found === 0 || trip?.status === 'expired' || trip?.status === 'rejected') {
        setNoDrivers(true);
        return;
      }
      await proceedToTrip(tripId, trip?.status);
    });
    return () => unsubscribe?.();
  }, [userId, tripId, proceedToTrip]);

  useEffect(() => {
    if (tripId) proceedToTrip(tripId);
  }, [tripId, proceedToTrip]);

  useEffect(() => {
    setTimedOut(false);
    const timeout = setTimeout(() => setTimedOut(true), SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [attempt]);

  const handleRetry = async () => {
    if (!tripId) return;
    setRetrying(true);
    try {
      const res = await retryRide(tripId);
      if (res.drivers_found > 0) {
        setNoDrivers(false);
        setAttempt((a) => a + 1);
      }
    } catch {
      // keep the timeout screen so the passenger can retry again
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (tripId) {
      await cancelRide(tripId).catch(() => {});
    }
    replace('Home');
  };

  if (timedOut || noDrivers) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>No hay conductores disponibles cerca</Text>
          <Text style={styles.subtitle}>Intentá buscar de nuevo en unos minutos.</Text>
          <Button variant="primary" onPress={handleRetry} loading={retrying} style={styles.button}>
            Buscar conductor de nuevo
          </Button>
          <Button variant="secondary" onPress={handleCancel} style={styles.button}>
            Cancelar
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.title}>Conectando con el conductor...</Text>
        <Text style={styles.subtitle}>Buscando el conductor más cercano</Text>
        <Button variant="secondary" onPress={handleCancel} style={styles.button}>
          Cancelar
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  button: { marginTop: theme.spacing.md, minWidth: 200 },
});
