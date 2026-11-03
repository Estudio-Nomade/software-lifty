import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import type { Trip } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { MapView } from '../components/MapView';
import { RatingStars } from '../components/RatingStars';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  buildTripCancelledParams,
  claimTripCancelNotice,
  isCancelledTripStatus,
  resolveActiveGoneAction,
} from '../lib/cancellation';
import { mergeTripUpdate } from '../lib/mergeTrip';
import { startOfferRingtone, stopOfferRingtone } from '../lib/offerRingtone';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const RESPONSE_SECONDS = 20;

const formatCurrency = (value: number | null | undefined) =>
  value == null ? '—' : `$${value.toLocaleString('es-AR')}`;

const formatDistance = (value: number | null | undefined) => {
  if (value == null) return '';
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value} km`;
};

export const IncomingRequestScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const { setActiveTrip } = useTripStore();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [seconds, setSeconds] = useState(RESPONSE_SECONDS);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const timedOut = useRef(false);
  const acceptingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lat = useLocationStore((s) => s.lat);
  const lng = useLocationStore((s) => s.lng);

  const showPassengerCancelled = (payload: Record<string, unknown> | null | undefined) => {
    const id = payload?.id != null ? String(payload.id) : trip?.id;
    if (!claimTripCancelNotice(id)) return;
    stopOfferRingtone();
    navigation.replace('TripCancelled', buildTripCancelledParams(payload));
  };

  /** active gone while we held an offer — check detail so expired ≠ passenger cancel */
  const handleActiveGone = async (tripId: string | undefined) => {
    if (!tripId) {
      stopOfferRingtone();
      navigation.goBack();
      return;
    }
    try {
      const response = await apiClient.get(`/trips/${tripId}`);
      const detail = (response.data?.data ?? response.data) as Record<string, unknown> | null;
      const resolved = resolveActiveGoneAction(detail);
      if (resolved.action === 'trip_cancelled') {
        showPassengerCancelled(detail);
        return;
      }
    } catch {
      /* 404 / network → silent dismiss */
    }
    stopOfferRingtone();
    navigation.goBack();
  };

  const handleActiveTrip = (active: Trip | null) => {
    if (!active) {
      setLoading(false);
      void handleActiveGone(trip?.id ?? useTripStore.getState().activeTripId ?? undefined);
      return;
    }
    if (isCancelledTripStatus(active.status)) {
      setLoading(false);
      showPassengerCancelled(active as unknown as Record<string, unknown>);
      return;
    }
    stopOfferRingtone();
    setActiveTrip(active);
    switch (active.status) {
      case 'accepted':
      case 'en_route':
        navigation.replace('Navigation');
        break;
      case 'waiting':
        navigation.replace('WaitingPassenger');
        break;
      case 'in_trip':
        navigation.replace('TripInProgress');
        break;
      case 'completed':
        navigation.replace('TripComplete');
        break;
      default:
        navigation.goBack();
    }
  };

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const stored = useTripStore.getState().trip;
    if (stored && (stored.status === 'request_received' || stored.status === 'offered')) {
      setTrip(stored);
      setActiveTrip(stored);
      setLoading(false);
    }

    const loadTrip = async () => {
      try {
        const response = await apiClient.get('/trips/active');
        const active = (response.data?.data ?? response.data) as Trip | null;
        if (cancelled) return;
        if (active && (active.status === 'request_received' || active.status === 'offered')) {
          setTrip(active);
          setActiveTrip(active);
          setLoading(false);
          retries = 0;
        } else if (active) {
          setLoading(false);
          handleActiveTrip(active);
        } else {
          const knownId =
            useTripStore.getState().activeTripId ??
            (stored && (stored.status === 'request_received' || stored.status === 'offered')
              ? stored.id
              : undefined);
          if (knownId) {
            setLoading(false);
            void handleActiveGone(knownId);
            return;
          }
          retries++;
          if (retries < 12) {
            setTimeout(loadTrip, 2000);
          } else {
            setLoading(false);
            navigation.goBack();
          }
        }
      } catch {
        if (cancelled) return;
        retries++;
        if (retries < 12) {
          setTimeout(loadTrip, 2000);
        } else {
          setLoading(false);
          navigation.goBack();
        }
      }
    };
    loadTrip();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !trip ||
      accepted ||
      timedOut.current ||
      acceptingRef.current ||
      (trip.status !== 'request_received' && trip.status !== 'offered')
    ) {
      return;
    }
    void startOfferRingtone();
    return () => {
      stopOfferRingtone();
    };
  }, [trip?.id, trip?.status, accepted]);

  useEffect(() => {
    if (!trip || accepted || timedOut.current || acceptingRef.current) return;
    if (seconds <= 0) {
      if (acceptingRef.current || accepted) return;
      timedOut.current = true;
      stopOfferRingtone();
      apiClient
        .post(`/trips/${trip.id}/reject`)
        .catch(() => {})
        .finally(() => {
          if (acceptingRef.current) return;
          navigation.navigate('Active');
        });
      return;
    }
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, accepted, trip]);

  useEffect(() => {
    if (!trip?.id || accepted || timedOut.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const response = await apiClient.get('/trips/active');
        const active = (response.data?.data ?? response.data) as Trip | null;
        if (acceptingRef.current || accepted || timedOut.current) return;
        if (!active || (active.status !== 'request_received' && active.status !== 'offered')) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (active) {
            handleActiveTrip(active);
          } else {
            void handleActiveGone(trip.id);
          }
        }
      } catch {}
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, accepted]);

  useEffect(() => {
    if (!trip || lat == null || lng == null) return;
    apiClient
      .get('/maps/directions', {
        params: {
          origin_lat: lat,
          origin_lng: lng,
          dest_lat: trip.origin_lat,
          dest_lng: trip.origin_lng,
        },
      })
      .then((response) => {
        setEtaMinutes(response.data?.duration_minutes ?? null);
      })
      .catch(() => {});
  }, [trip, lat, lng]);

  const handleAccept = async () => {
    if (!trip || loading || acceptingRef.current) return;
    acceptingRef.current = true;
    stopOfferRingtone();
    setLoading(true);
    try {
      const response = await apiClient.post(`/trips/${trip.id}/accept`);
      const acceptedTrip = mergeTripUpdate(trip, response.data);
      if (acceptedTrip) {
        setActiveTrip(acceptedTrip);
      }
      setAccepted(true);
      navigation.replace('Navigation');
    } catch (err: any) {
      acceptingRef.current = false;
      if (__DEV__) console.error('[handleAccept] error:', err?.message ?? err);
      const isTokenExpired =
        err?.code === 'TOKEN_REQUIRED' || err?.error?.code === 'TOKEN_REQUIRED';
      if (isTokenExpired) {
        stopOfferRingtone();
      } else if (trip.status === 'request_received' || trip.status === 'offered') {
        void startOfferRingtone();
      }
      Alert.alert(
        'Error',
        isTokenExpired
          ? 'Tu sesion expiro. Inicia sesion nuevamente.'
          : 'No se pudo aceptar el viaje.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (isTokenExpired) {
                useTripStore.getState().clearTrip();
                navigation.replace('Welcome');
              }
            },
          },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!trip) return;
    stopOfferRingtone();
    try {
      await apiClient.post(`/trips/${trip.id}/reject`);
    } catch {}
    navigation.navigate('Active');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <MapView
        style={StyleSheet.absoluteFill as any}
        followUserLocation
        centerCoordinate={lat != null && lng != null ? [lng, lat] : [0, 0]}
        userLocation={lat != null && lng != null ? [lng, lat] : null}
      />
      <View style={styles.overlay}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + theme.spacing.md,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces
        >
          <Text style={styles.newRequest}>Nueva solicitud</Text>

          <View style={styles.timerCircle}>
            <Text style={styles.timerText}>
              {accepted ? '✓' : `0:${String(seconds).padStart(2, '0')}`}
            </Text>
          </View>

          <Card style={styles.routeCard}>
            {trip?.passenger_name ? (
              <View style={styles.passengerRow}>
                <Avatar uri={trip.passenger_avatar_url} name={trip.passenger_name} size={48} />
                <View style={styles.passengerInfo}>
                  <Text style={styles.passengerName}>{trip.passenger_name}</Text>
                  {trip.passenger_rating != null && <RatingStars rating={trip.passenger_rating} />}
                </View>
              </View>
            ) : null}
            {etaMinutes != null && <Text style={styles.etaText}>~{etaMinutes} min al pickup</Text>}
            <View style={styles.routePoint}>
              <Text style={styles.routeIconStart}>📍</Text>
              <Text style={styles.routeText}>{trip?.origin_address ?? 'Origen'}</Text>
            </View>
            <View style={styles.routeLine}>
              <Text style={styles.distanceText}>{formatDistance(trip?.distance_km)}</Text>
            </View>
            <View style={styles.routePoint}>
              <Text style={styles.routeIconEnd}>📍</Text>
              <Text style={styles.routeText}>{trip?.dest_address ?? 'Destino'}</Text>
            </View>
          </Card>

          <View style={styles.earningsBlock}>
            <Text style={styles.earningsLabel}>Ganaras</Text>
            <Text style={styles.earningsAmount}>{formatCurrency(trip?.driver_earnings)}</Text>

            <View style={styles.earningsBreakdown}>
              {trip && (trip.platform_fee ?? 0) > 0 ? (
                <>
                  <View style={styles.earningsBreakdownRow}>
                    <Text style={styles.earningsBreakdownLabel}>Total del viaje</Text>
                    <Text style={styles.earningsBreakdownValue}>
                      {formatCurrency(trip.total_fare)}
                    </Text>
                  </View>
                  <View style={styles.earningsBreakdownRow}>
                    <Text style={styles.earningsBreakdownLabel}>
                      Comision Lifty (
                      {Math.round(((trip.platform_fee ?? 0) / (trip.total_fare ?? 1)) * 100)}%)
                    </Text>
                    <Text style={styles.earningsBreakdownDeduction}>
                      -{formatCurrency(trip.platform_fee)}
                    </Text>
                  </View>
                </>
              ) : trip && (trip.platform_fee ?? 0) === 0 ? (
                <View style={styles.promoBadge}>
                  <Text style={styles.promoBadgeText}>Sin comision!</Text>
                </View>
              ) : null}
            </View>

            {trip?.passenger_cancel_visible && trip.passenger_cancel_count_30d != null ? (
              <Text style={styles.cancelRate}>
                Este pasajero tiene un {trip.passenger_cancel_rate_pct}% de cancelación en los
                últimos 30 días ({trip.passenger_cancel_count_30d} cancelaciones).
              </Text>
            ) : null}
          </View>

          {accepted ? (
            <Text style={styles.acceptedText}>Viaje aceptado!</Text>
          ) : (
            <View style={styles.actionsBlock}>
              <Button
                title="ACEPTAR"
                variant="cta"
                onPress={handleAccept}
                disabled={!trip}
                loading={loading}
                style={styles.button}
              />
              <TouchableOpacity onPress={handleReject} style={styles.rejectButton}>
                <Text style={styles.rejectLink}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const CONTENT_MAX_WIDTH = 340;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  newRequest: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
    textAlign: 'center',
    alignSelf: 'center',
  },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  timerText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  routeCard: {
    // Override Card's default width:'100%' + alignSelf:'stretch', which on Android
    // pins the fixed-width card to the left instead of centering it.
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: theme.spacing.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  routeIconStart: {
    fontSize: theme.fontSize.md,
  },
  routeIconEnd: {
    fontSize: theme.fontSize.md,
  },
  routeText: {
    flex: 1,
    flexShrink: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  routeLine: {
    height: theme.spacing.lg,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginLeft: theme.spacing.sm,
  },
  distanceText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  earningsBlock: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cancelRate: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  earningsLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
    textAlign: 'center',
  },
  earningsAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  earningsBreakdown: {
    width: '100%',
    maxWidth: 280,
    gap: theme.spacing.xs,
    alignItems: 'center',
    alignSelf: 'center',
  },
  earningsBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    width: '100%',
  },
  earningsBreakdownLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.white,
    opacity: 0.7,
  },
  earningsBreakdownValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  earningsBreakdownDeduction: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.dangerRed,
  },
  promoBadge: {
    backgroundColor: theme.colors.turquoise,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    alignSelf: 'center',
  },
  promoBadgeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  actionsBlock: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  button: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  rejectButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  rejectLink: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  acceptedText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  passengerInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  passengerName: {
    flexShrink: 1,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  etaText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
});
