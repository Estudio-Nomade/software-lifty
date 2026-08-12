import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { cancelRide, getRideDetails } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

const SEARCH_TIMEOUT_MS = 30_000;

export function ConnectingDriverScreen() {
  const { navigate, replace } = useAppNavigation();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const userId = useAuthStore((s) => s.userId);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (userId) {
      unsubscribe = subscribeToPassengerChannel(userId, async (trip: any) => {
        if (!tripId || trip?.id !== tripId || !trip?.driver_id) return;
        const full = await getRideDetails(tripId).catch(() => null);
        setActiveTrip(full ?? trip);
        replace('TripInProgress');
      });
    }

    const timeout = setTimeout(() => setTimedOut(true), SEARCH_TIMEOUT_MS);

    return () => {
      unsubscribe?.();
      clearTimeout(timeout);
    };
  }, [userId, tripId, setActiveTrip, replace]);

  const handleCancel = async () => {
    if (tripId) {
      await cancelRide(tripId).catch(() => {});
    }
    replace('Home');
  };

  if (timedOut) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>No hay conductores disponibles cerca</Text>
          <Text style={styles.subtitle}>Intentá de nuevo en unos minutos.</Text>
          <Button variant="primary" onPress={handleCancel} style={styles.button}>
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
