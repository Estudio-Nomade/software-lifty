import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { Trip } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { MapView } from '../components/MapView';
import { RatingStars } from '../components/RatingStars';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { stopTracking } from '../lib/location';
import { useLocationStore } from '../store/locationStore';
import { useOnlineStore } from '../store/onlineStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const RESPONSE_SECONDS = 8;

const formatCurrency = (value: number | null | undefined) =>
  value == null ? '—' : `$${value.toLocaleString('es-AR')}`;

const formatDistance = (value: number | null | undefined) => (value == null ? '' : `${value} km`);

export const IncomingRequestScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { setActiveTrip } = useTripStore();
  const setOnline = useOnlineStore((s) => s.setOnline);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [seconds, setSeconds] = useState(RESPONSE_SECONDS);
  const [accepted, setAccepted] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const timedOut = useRef(false);
  const lat = useLocationStore((s) => s.lat);
  const lng = useLocationStore((s) => s.lng);

  const disconnect = () => {
    const ref = useOnlineStore.getState().heartbeatIntervalRef;
    if (ref) clearInterval(ref);
    useOnlineStore.getState().setHeartbeatRef(null);
    stopTracking();
  };

  useEffect(() => {
    let cancelled = false;
    const loadTrip = async () => {
      try {
        const response = await apiClient.get('/trips/active');
        const active = (response.data?.data ?? response.data) as Trip | null;
        if (cancelled) return;
        if (active && active.status === 'request_received') {
          setTrip(active);
          setActiveTrip(active);
        } else {
          navigation.navigate('Online');
        }
      } catch {
        if (!cancelled) navigation.navigate('Online');
      }
    };
    loadTrip();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!trip || accepted || timedOut.current) return;
    if (seconds <= 0) {
      timedOut.current = true;
      apiClient
        .post(`/trips/${trip.id}/reject`)
        .catch(() => {})
        .finally(() => {
          navigation.navigate('Online');
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
    if (!trip) return;
    try {
      await apiClient.post(`/trips/${trip.id}/accept`);
      setActiveTrip({ ...trip, status: 'accepted' });
      setAccepted(true);
      navigation.navigate('Navigation');
    } catch {}
  };

  const handleReject = async () => {
    if (!trip) return;
    try {
      await apiClient.post(`/trips/${trip.id}/reject`);
    } catch {}
    try {
      await apiClient.put('/drivers/me/online', { is_online: false });
      setOnline(false);
    } catch {}
    disconnect();
    navigation.navigate('Online');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <MapView style={StyleSheet.absoluteFill as any} followUserLocation />
      <View style={styles.overlay}>
        <View style={styles.spacer} />
        <Text style={styles.newRequest}>Nueva solicitud</Text>

        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{accepted ? '✓' : `0:0${seconds}`}</Text>
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

        <View style={{ height: theme.spacing.md }} />

        <Text style={styles.earningsLabel}>Ganaras</Text>
        <Text style={styles.earningsAmount}>{formatCurrency(trip?.driver_earnings)}</Text>

        <View style={{ height: theme.spacing.lg }} />

        {accepted ? (
          <Text style={styles.acceptedText}>Viaje aceptado!</Text>
        ) : (
          <>
            <Button title="ACEPTAR" variant="cta" onPress={handleAccept} style={styles.button} />
            <TouchableOpacity onPress={handleReject}>
              <Text style={styles.rejectLink}>Rechazar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  spacer: {
    height: 32,
  },
  newRequest: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  routeCard: {
    width: 310,
    gap: theme.spacing.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  routeIconStart: {
    fontSize: 16,
  },
  routeIconEnd: {
    fontSize: 16,
  },
  routeText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  routeLine: {
    height: 24,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  distanceText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  earningsLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  earningsAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  button: {
    width: 327,
  },
  rejectLink: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    marginTop: theme.spacing.sm,
  },
  acceptedText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  passengerInfo: {
    gap: 2,
  },
  passengerName: {
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
