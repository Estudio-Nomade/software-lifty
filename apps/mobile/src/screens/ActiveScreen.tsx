import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { apiClient, getValidated } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { MapView } from '../components/MapView';
import { Navbar } from '../components/Navbar';
import { SideMenu } from '../components/SideMenu';
import { Toggle } from '../components/Toggle';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { useHeatmapPolling } from '../hooks/useHeatmapPolling';
import { useLocationWS } from '../hooks/useLocationWS';
import { startTracking, stopTracking } from '../lib/location';
import { subscribeToDriverChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useLocationStore } from '../store/locationStore';
import { ONLINE_SINCE_KEY, useOnlineStore } from '../store/onlineStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 180;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.45;
const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatOnlineTime = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const havDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
};

export const ActiveScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const setOnline = useOnlineStore((s) => s.setOnline);
  const onlineSince = useOnlineStore((s) => s.onlineSince);
  const setOnlineSince = useOnlineStore((s) => s.setOnlineSince);
  const driverId = useAuthStore((s) => s.driverId);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const heatmapPoints = useHeatmapPolling();
  const [menuVisible, setMenuVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [onlineTime, setOnlineTime] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const signedOutRef = useRef(false);
  const signOut = useSignOut();
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  useLocationWS();

  const profileSchema = z.object({
    full_name: z.string(),
    avatar_url: z.string().nullable(),
    vehicle: z
      .object({
        vehicle_type: z.string(),
      })
      .nullable(),
  });

  const { data: profile } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => getValidated('/drivers/me', profileSchema),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (profile?.vehicle?.vehicle_type) {
      useVehicleStore.getState().setVehicleType(profile.vehicle.vehicle_type);
    }
  }, [profile?.vehicle?.vehicle_type]);

  useEffect(() => {
    if (!isOnline) return;

    const heartbeatInterval = setInterval(() => {
      const { lat, lng, heading } = useLocationStore.getState();
      apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    startTracking();

    return () => {
      clearInterval(heartbeatInterval);
      useOnlineStore.getState().setHeartbeatRef(null);
      stopTracking();
    };
  }, [isOnline]);

  useEffect(() => {
    if (!driverId || !isOnline) return;

    let navigated = false;

    const unsubscribe = subscribeToDriverChannel(driverId, () => {
      if (!navigated) {
        navigated = true;
        navigation.navigate('IncomingRequest');
      }
    });

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        const trip = data?.data ?? data;
        if (
          !navigated &&
          trip &&
          (trip.status === 'request_received' || trip.status === 'offered')
        ) {
          navigated = true;
          navigation.navigate('IncomingRequest');
        }
      } catch {}
    }, 5_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [driverId, isOnline, navigation]);

  useEffect(() => {
    if (!onlineSince) return;
    setOnlineTime(Date.now() - onlineSince);
    const interval = setInterval(() => {
      setOnlineTime(Date.now() - onlineSince);
    }, 30_000);
    return () => clearInterval(interval);
  }, [onlineSince]);

  const connect = useCallback(async () => {
    setToggleError(null);
    try {
      await apiClient.put('/drivers/me/online', { is_online: true });
      const now = Date.now();
      setOnlineSince(now);
      useOnlineStore.setState({ isOnline: true });
      AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
      setOnline(true);
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : 'Error al conectar');
    }
  }, [setOnline, setOnlineSince]);

  const disconnect = useCallback(async () => {
    setToggleError(null);
    try {
      await apiClient.put('/drivers/me/online', { is_online: false });

      const ref = useOnlineStore.getState().heartbeatIntervalRef;
      if (ref) clearInterval(ref);
      useOnlineStore.getState().setHeartbeatRef(null);

      stopTracking();
      setOnline(false);
      useOnlineStore.setState({ isOnline: false });
      AsyncStorage.removeItem(ONLINE_SINCE_KEY).catch(() => {});
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : 'Error al desconectar');
    }
  }, [setOnline]);

  const handleMapMove = useCallback((center: { lat: number; lng: number }) => {
    setMapCenter(center);
  }, []);

  const handleRecenter = useCallback(() => {
    setRecenterKey((k) => k + 1);
  }, []);

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (newValue) {
        await connect();
      } else {
        await disconnect();
      }
    },
    [connect, disconnect],
  );

  const goBackToHome = useCallback(() => {
    navigation.replace('Online');
  }, [navigation]);

  const { data: earnings } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/earnings/daily');
      return response.data.data ?? response.data;
    },
    refetchInterval: 60_000,
    enabled: sheetExpanded && isOnline,
  });

  const handleSnapChange = useCallback((index: number) => {
    setSheetExpanded(index === 1);
  }, []);

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: 'home-outline' as const,
        onPress: () => navigation.navigate('Online'),
      },
      {
        label: 'Ganancias',
        icon: 'wallet-outline' as const,
        onPress: () => navigation.navigate('Earnings'),
      },
      {
        label: 'Metodo de cobro',
        icon: 'card-outline' as const,
        onPress: () => navigation.navigate('PaymentMethod'),
      },
      {
        label: 'Perfil',
        icon: 'person-outline' as const,
        onPress: () => navigation.navigate('Profile'),
      },
      {
        label: 'Historial de viajes',
        icon: 'document-text-outline' as const,
        onPress: () => navigation.navigate('TripHistory'),
      },
      ...(isOnline
        ? [
            {
              label: 'Desconectarse',
              icon: 'power-outline' as const,
              onPress: () => handleToggle(false),
              dividerTop: true,
            },
          ]
        : []),
      {
        label: 'Cerrar sesion',
        icon: 'log-out-outline' as const,
        onPress: () => signOut.mutateAsync(),
        danger: true,
      },
    ],
    [navigation, signOut, handleToggle, isOnline],
  );

  const isOffCenter =
    mapCenter && locationLat != null && locationLng != null
      ? havDistance(mapCenter, { lat: locationLat, lng: locationLng }) > 10
      : false;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />

      {locationLat != null && locationLng != null ? (
        <>
          <MapView
            style={StyleSheet.absoluteFill as any}
            followUserLocation
            centerCoordinate={[locationLng, locationLat]}
            userLocation={[locationLng, locationLat]}
            heatmapPoints={heatmapPoints}
            onMoveEnd={handleMapMove}
            recenterKey={recenterKey}
          />

          {isOffCenter && (
            <TouchableOpacity
              style={styles.recenterButton}
              onPress={handleRecenter}
              activeOpacity={0.8}
            >
              <Ionicons name="locate-outline" size={24} color={theme.colors.turquoise} />
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.mapLoading}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
          <Text style={styles.mapLoadingText}>Obteniendo ubicación...</Text>
        </View>
      )}

      <View style={styles.headerOverlay}>
        <Navbar
          showHamburger
          onHamburgerPress={() => setMenuVisible(true)}
          rightElement={
            <View style={styles.headerRight}>
              {isOnline && (
                <TouchableOpacity
                  style={styles.connectedBadge}
                  activeOpacity={0.7}
                  onPress={() => handleToggle(false)}
                >
                  <Text style={styles.connectedBadgeText}>Conectado</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.avatarButton}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Profile')}
              >
                <Avatar
                  uri={profile?.avatar_url ?? null}
                  name={profile?.full_name ?? ''}
                  size={44}
                />
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      {isOnline ? (
        <BottomSheet
          snapPoints={[COLLAPSED_HEIGHT, EXPANDED_HEIGHT]}
          onSnapChange={handleSnapChange}
        >
          <View style={styles.sheetContent}>
            <View style={styles.toggleRow}>
              <Text style={styles.statusOnline}>Estas conectado</Text>
              <Toggle value={true} onToggle={handleToggle} />
            </View>
            <Text style={styles.statusOnlineTime}>{formatOnlineTime(onlineTime)}</Text>
            {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}

            <View style={styles.metricsContainer}>
              <Text style={styles.metricsTitle}>Resumen de hoy</Text>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Viajes completados</Text>
                <Text style={styles.metricValue}>{earnings?.trip_count ?? '--'}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Ganancias acumuladas</Text>
                <Text style={styles.metricValue}>
                  {earnings ? formatCurrency(earnings.total) : '--'}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Tiempo online</Text>
                <Text style={styles.metricValue}>{formatOnlineTime(onlineTime)}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Tasa de aceptacion</Text>
                <Text style={[styles.metricValue, { color: theme.colors.mediumGray }]}>--</Text>
              </View>

              <TouchableOpacity
                style={styles.earningsButton}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Earnings')}
              >
                <Text style={styles.earningsButtonText}>Ver ganancias</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheet>
      ) : (
        <View style={styles.offlineBar}>
          <View style={styles.offlineBarContent}>
            <View style={styles.offlineBarText}>
              <Text style={styles.offlineBarTitle}>Conectate, empeza a viajar</Text>
              <Text style={styles.offlineBarSubtitle}>Recibi solicitudes de viaje</Text>
            </View>
            <Toggle value={false} onToggle={handleToggle} />
          </View>
          {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}
          <TouchableOpacity
            style={styles.backHomeButton}
            activeOpacity={0.8}
            onPress={goBackToHome}
          >
            <Text style={styles.backHomeButtonText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      )}

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />

      {isOffCenter && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Ionicons name="locate-outline" size={24} color={theme.colors.turquoise} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  connectedBadge: {
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
  },
  connectedBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: theme.fontWeight.medium,
  },
  avatarButton: {
    width: 44,
    height: 44,
  },
  ctaTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  offlineBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    zIndex: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    gap: theme.spacing.md,
  },
  offlineBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  offlineBarText: {
    flex: 1,
    gap: 2,
  },
  offlineBarTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  offlineBarSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  statusOnline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  statusOnlineTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  statusOffline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  metricsContainer: {
    width: '100%',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  metricsTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  metricLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  metricValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  earningsButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.buttonRadius,
    height: theme.dimensions.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  backHomeButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.deepBlue,
    borderRadius: theme.radius.buttonRadius,
    height: theme.dimensions.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backHomeButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  recenterButton: {
    position: 'absolute',
    bottom: 200,
    right: theme.spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapLoading: {
    ...(StyleSheet.absoluteFill as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
  },
  mapLoadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
});
