import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { BottomSheet } from '../components/BottomSheet';
import { MapView } from '../components/MapView';
import { Navbar } from '../components/Navbar';
import { SideMenu } from '../components/SideMenu';
import { Toggle } from '../components/Toggle';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { useHeatmapPolling } from '../hooks/useHeatmapPolling';
import { useLocationWS } from '../hooks/useLocationWS';
import { startTracking, stopTracking } from '../lib/location';
import { subscribeToDriverChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useLocationStore } from '../store/locationStore';
import { ONLINE_SINCE_KEY, useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 100;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.45;
const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatOnlineTime = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const ActiveScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const setOnline = useOnlineStore((s) => s.setOnline);
  const onlineSince = useOnlineStore((s) => s.onlineSince);
  const setOnlineSince = useOnlineStore((s) => s.setOnlineSince);
  const driverId = useAuthStore((s) => s.driverId);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const heatmapPoints = useHeatmapPolling();
  const [menuVisible, setMenuVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [onlineTime, setOnlineTime] = useState(0);
  const disconnectedRef = useRef(false);
  const signOut = useSignOut();
  useLocationWS();

  useEffect(() => {
    const reconcile = async () => {
      if (onlineSince) return;
      try {
        const stored = await AsyncStorage.getItem(ONLINE_SINCE_KEY);
        if (stored) {
          const ts = Number(stored);
          if (!Number.isNaN(ts)) {
            setOnlineSince(ts);
            useOnlineStore.setState({ isOnline: true });
          }
        } else {
          const now = Date.now();
          setOnlineSince(now);
          useOnlineStore.setState({ isOnline: true });
          AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
        }
      } catch {}
    };
    reconcile();
  }, []);

  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      const { lat, lng, heading } = useLocationStore.getState();
      apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    startTracking();

    return () => {
      if (!disconnectedRef.current) {
        clearInterval(heartbeatInterval);
        useOnlineStore.getState().setHeartbeatRef(null);
        stopTracking();
      }
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;

    const unsubscribe = subscribeToDriverChannel(driverId, () => {
      navigation.navigate('IncomingRequest');
    });

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        if (data && data.status === 'request_received') {
          navigation.navigate('IncomingRequest');
        }
      } catch {}
    }, 5_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [driverId, navigation]);

  useEffect(() => {
    if (!onlineSince) return;
    setOnlineTime(Date.now() - onlineSince);
    const interval = setInterval(() => {
      setOnlineTime(Date.now() - onlineSince);
    }, 30_000);
    return () => clearInterval(interval);
  }, [onlineSince]);

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (newValue) return;

      setToggleError(null);

      try {
        await apiClient.put('/drivers/me/online', { is_online: false });
        setOnline(false);
        disconnectedRef.current = true;

        const ref = useOnlineStore.getState().heartbeatIntervalRef;
        if (ref) clearInterval(ref);
        useOnlineStore.getState().setHeartbeatRef(null);

        stopTracking();

        navigation.replace('Online');
      } catch (err: unknown) {
        setToggleError(err instanceof Error ? err.message : 'Error al cambiar estado');
      }
    },
    [setOnline, navigation],
  );

  const { data: earnings } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/earnings/daily');
      return response.data.data ?? response.data;
    },
    refetchInterval: 60_000,
    enabled: sheetExpanded,
  });

  const handleSnapChange = useCallback((index: number) => {
    setSheetExpanded(index === 1);
  }, []);

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: 'home-outline' as const,
        onPress: () => {},
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
      {
        label: 'Desconectarse',
        icon: 'power-outline' as const,
        onPress: () => handleToggle(false),
        dividerTop: true,
      },
      {
        label: 'Cerrar sesion',
        icon: 'log-out-outline' as const,
        onPress: () => signOut.mutateAsync(),
        danger: true,
      },
    ],
    [navigation, signOut, handleToggle],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />

      {/* Heatmap hidden naturally when navigating away to IncomingRequest (component unmounts) */}
      <MapView
        style={StyleSheet.absoluteFill as any}
        followUserLocation
        heatmapPoints={heatmapPoints}
      />

      <View style={styles.headerOverlay}>
        <Navbar
          showHamburger
          onHamburgerPress={() => setMenuVisible(true)}
          rightElement={
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.connectedBadge}
                activeOpacity={0.7}
                onPress={() => handleToggle(false)}
              >
                <Text style={styles.connectedBadgeText}>Conectado ⏻</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.avatarButton}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Profile')}
              >
                <Text style={styles.avatarText}>👤</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      <BottomSheet snapPoints={[COLLAPSED_HEIGHT, EXPANDED_HEIGHT]} onSnapChange={handleSnapChange}>
        <View style={styles.sheetContent}>
          <View style={styles.toggleRow}>
            <Text style={styles.statusOnline}>Estas conectado</Text>
            <Toggle value={true} onToggle={handleToggle} />
          </View>
          <Text style={styles.statusOffline}>Desconectado</Text>
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

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />
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
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
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
  statusOffline: {
    fontSize: theme.fontSize.sm,
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
});
