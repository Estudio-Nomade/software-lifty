import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cancelRide, getRideDetails, retryRide } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { subscribeToPassengerChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

export const SEARCH_TIMEOUT_MS = 120_000;
export const POLL_INTERVAL_MS = 4_000;
export const SILENT_RETRY_INTERVAL_MS = 15_000;

const LIVE_STATUSES = new Set(['accepted', 'en_route', 'waiting', 'in_trip']);
const CANCELLED_STATUSES = new Set(['cancelled', 'cancelled_early', 'cancelled_late']);

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function sameTripId(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function ConnectingDriverScreen() {
  const { replace } = useAppNavigation();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const userId = useAuthStore((s) => s.userId);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(SEARCH_TIMEOUT_MS / 1000));
  const navigatingRef = useRef(false);
  const silentRetryInFlightRef = useRef(false);
  const retryNotAllowedRef = useRef(false);
  const searchEndedRef = useRef(false);

  const showEmpty = timedOut;

  const proceedToTrip = useCallback(
    async (id: string, statusHint?: string) => {
      if (navigatingRef.current) return;
      if (statusHint && !LIVE_STATUSES.has(statusHint)) return;
      const full = await getRideDetails(id).catch(() => null);
      if (!full || !LIVE_STATUSES.has(full.status)) return;
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      searchEndedRef.current = true;
      setActiveTrip(full);
      replace('TripInProgress');
    },
    [setActiveTrip, replace],
  );

  useEffect(() => {
    searchEndedRef.current = false;
    navigatingRef.current = false;
    silentRetryInFlightRef.current = false;
    retryNotAllowedRef.current = false;
  }, [attempt]);

  useEffect(() => {
    if (!userId || !tripId) return;
    const unsubscribe = subscribeToPassengerChannel(userId, async (trip: any) => {
      if (!sameTripId(trip?.id, tripId)) return;
      if (CANCELLED_STATUSES.has(trip?.status)) {
        searchEndedRef.current = true;
        setTimedOut(true);
        return;
      }
      if (trip?.drivers_found === 0 || trip?.status === 'expired' || trip?.status === 'rejected') {
        return;
      }
      await proceedToTrip(String(tripId), trip?.status);
    });
    return () => unsubscribe?.();
  }, [userId, tripId, proceedToTrip, attempt]);

  useEffect(() => {
    if (!tripId || showEmpty) return;

    let cancelled = false;

    const pollOnce = async () => {
      if (cancelled || navigatingRef.current || searchEndedRef.current) return;
      const full = await getRideDetails(String(tripId)).catch(() => null);
      if (cancelled || !full) return;
      if (LIVE_STATUSES.has(full.status)) {
        await proceedToTrip(String(tripId), full.status);
        return;
      }
      if (CANCELLED_STATUSES.has(full.status)) {
        searchEndedRef.current = true;
        setTimedOut(true);
      }
    };

    void pollOnce();
    const poll = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [tripId, proceedToTrip, attempt, showEmpty]);

  useEffect(() => {
    if (!tripId || showEmpty) return;

    let cancelled = false;

    const runSilentRetry = async () => {
      if (
        cancelled ||
        navigatingRef.current ||
        searchEndedRef.current ||
        silentRetryInFlightRef.current ||
        retryNotAllowedRef.current
      ) {
        return;
      }
      silentRetryInFlightRef.current = true;
      try {
        const res = await retryRide(String(tripId));
        if (cancelled) return;
        if (res?.trip && LIVE_STATUSES.has(res.trip.status)) {
          await proceedToTrip(String(tripId), res.trip.status);
        }
      } catch (err: unknown) {
        const status =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        const code =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { error?: { code?: string } } } }).response?.data?.error
                ?.code
            : undefined;
        if (status === 400 || code === 'BAD_REQUEST') {
          retryNotAllowedRef.current = true;
        }
      } finally {
        silentRetryInFlightRef.current = false;
      }
    };

    const interval = setInterval(() => {
      void runSilentRetry();
    }, SILENT_RETRY_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tripId, proceedToTrip, attempt, showEmpty]);

  useEffect(() => {
    setTimedOut(false);
    const totalSeconds = Math.floor(SEARCH_TIMEOUT_MS / 1000);
    setSecondsLeft(totalSeconds);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, totalSeconds - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        if (!navigatingRef.current) {
          searchEndedRef.current = true;
          setTimedOut(true);
        }
      }
    }, 1000);
    const timeout = setTimeout(() => {
      setSecondsLeft(0);
      if (!navigatingRef.current) {
        searchEndedRef.current = true;
        setTimedOut(true);
      }
    }, SEARCH_TIMEOUT_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timeout);
    };
  }, [attempt]);

  const handleRetry = async () => {
    if (!tripId) return;
    setRetrying(true);
    retryNotAllowedRef.current = false;
    searchEndedRef.current = false;
    setTimedOut(false);
    setAttempt((a) => a + 1);
    try {
      await retryRide(String(tripId));
    } catch {
      // stay searching; timeout path still applies
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    searchEndedRef.current = true;
    if (tripId) {
      await cancelRide(String(tripId)).catch(() => {});
    }
    replace('Home');
  };

  if (showEmpty) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Buscando conductor</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.emptyCard} accessibilityRole="alert">
            <Text style={styles.emptyTitle}>Sin conductores disponibles</Text>
            <Text style={styles.emptySubtitle}>
              No hay conductores cerca por ahora. Podés volver a buscar o cancelar.
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              variant="primary"
              onPress={handleRetry}
              loading={retrying}
              style={styles.fullButton}
            >
              Volver a buscar
            </Button>
            <Button variant="secondary" onPress={handleCancel} style={styles.fullButton}>
              Cancelar
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Buscando conductor</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.searchBlock}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.searchSubtitle}>Buscando conductores cercanos…</Text>
          <Text style={styles.countdown}>{formatCountdown(secondsLeft)}</Text>
        </View>
        <View style={styles.actions}>
          <Button variant="secondary" onPress={handleCancel} style={styles.fullButton}>
            Cancelar
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    backgroundColor: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  body: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    justifyContent: 'space-between',
  },
  searchBlock: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingTop: theme.spacing['2xl'],
  },
  searchSubtitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  countdown: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.amber,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  actions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  fullButton: {
    width: '100%',
    minHeight: 48,
  },
});
