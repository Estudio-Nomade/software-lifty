import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { apiClient, getValidated } from '../api/client';
import { driverStatusSchema, earningsDailySchema } from '../api/types';
import type { EarningsDaily } from '../api/types';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { GoButton } from '../components/GoButton';
import { MapView } from '../components/MapView';
import { Navbar } from '../components/Navbar';
import { PayoutMethodGateModal } from '../components/PayoutMethodGateModal';
import { SideMenu } from '../components/SideMenu';
import { Toggle } from '../components/Toggle';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Snackbar } from '../components/feedback/Snackbar';
import type { SnackbarTone } from '../components/feedback/Snackbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { useHeatmapPolling } from '../hooks/useHeatmapPolling';
import { usePayoutMethodGate } from '../hooks/usePayoutMethodGate';
import { shouldShowPlatformDebt } from '../lib/commission';
import {
  type ConnectBlockedFeedback,
  feedbackForConnectBlock,
  feedbackFromConnectError,
} from '../lib/connectBlockedFeedback';
import { getCurrentPosition, stopTracking } from '../lib/location';
import { useLocationStore } from '../store/locationStore';
import { ONLINE_SINCE_KEY, useOnlineStore } from '../store/onlineStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ONLINE_COLLAPSED = 180;
const ONLINE_EXPANDED = SCREEN_HEIGHT * 0.45;
const OFFLINE_PILL = 96;
const OFFLINE_EXPANDED = SCREEN_HEIGHT * 0.45;

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
  const insets = useSafeAreaInsets();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const setOnline = useOnlineStore((s) => s.setOnline);
  const onlineSince = useOnlineStore((s) => s.onlineSince);
  const setOnlineSince = useOnlineStore((s) => s.setOnlineSince);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [connectFeedback, setConnectFeedback] = useState<ConnectBlockedFeedback | null>(null);
  const [connecting, setConnecting] = useState(false);
  const heatmapPoints = useHeatmapPolling();
  const [menuVisible, setMenuVisible] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [onlineTime, setOnlineTime] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [retryingLocation, setRetryingLocation] = useState(false);
  const signOut = useSignOut();
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const locationError = useLocationStore((s) => s.locationError);
  const hasLocation = locationLat != null && locationLng != null;

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
    if (!onlineSince) return;
    setOnlineTime(Date.now() - onlineSince);
    const interval = setInterval(() => {
      setOnlineTime(Date.now() - onlineSince);
    }, 30_000);
    return () => clearInterval(interval);
  }, [onlineSince]);

  const { data: driverStatus } = useQuery({
    queryKey: ['driverStatus'],
    queryFn: () => getValidated('/drivers/me/status', driverStatusSchema),
    refetchInterval: 30_000,
  });

  const documentsPendingReview = driverStatus?.documents_pending_review ?? false;
  const { needsPayoutMethod, refreshPayoutMethods } = usePayoutMethodGate(driverStatus);

  useFocusEffect(
    useCallback(() => {
      refreshPayoutMethods();
    }, [refreshPayoutMethods]),
  );

  const awaitingApproval =
    driverStatus?.status === 'under_review' || driverStatus?.step === 'review';
  const connectBlocked = documentsPendingReview || awaitingApproval;

  const {
    data: earnings,
    isLoading: earningsLoading,
    isError: earningsIsError,
    error: earningsError,
    refetch: refetchEarnings,
  } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: () => getValidated('/drivers/me/earnings/daily', earningsDailySchema),
    refetchInterval: 60_000,
  });

  const showConnectFeedback = useCallback((feedback: ConnectBlockedFeedback) => {
    setToggleError(null);
    setConnectFeedback(feedback);
  }, []);

  const dismissConnectFeedback = useCallback(() => {
    setConnectFeedback(null);
  }, []);

  const connect = useCallback(async () => {
    setToggleError(null);
    setConnectFeedback(null);

    if (awaitingApproval) {
      showConnectFeedback(feedbackForConnectBlock('not_approved'));
      return;
    }

    if (needsPayoutMethod) {
      setToggleError('Necesitamos tu medio de cobro (CBU/CVU + alias) antes de conectarte.');
      return;
    }

    if (documentsPendingReview) {
      showConnectFeedback(feedbackForConnectBlock('docs_pending'));
      return;
    }

    if (!hasLocation) {
      showConnectFeedback(feedbackForConnectBlock('no_location'));
      return;
    }

    setConnecting(true);
    try {
      await apiClient.put('/drivers/me/online', { is_online: true });
      const { lat, lng, heading } = useLocationStore.getState();
      if (lat != null && lng != null) {
        await apiClient.put('/drivers/me/heartbeat', { lat, lng, heading }).catch(() => {});
      }
      const now = Date.now();
      setOnlineSince(now);
      useOnlineStore.setState({ isOnline: true });
      AsyncStorage.setItem(ONLINE_SINCE_KEY, String(now)).catch(() => {});
      setOnline(true);
    } catch (err: unknown) {
      showConnectFeedback(feedbackFromConnectError(err));
    } finally {
      setConnecting(false);
    }
  }, [
    awaitingApproval,
    documentsPendingReview,
    hasLocation,
    needsPayoutMethod,
    setOnline,
    setOnlineSince,
    showConnectFeedback,
    feedbackForConnectBlock,
    feedbackFromConnectError,
  ]);

  const disconnect = useCallback(async () => {
    setToggleError(null);
    setConnectFeedback(null);
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

  const handleSnapChange = useCallback((index: number) => {
    setSheetExpanded(index === 1);
  }, []);

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: 'home-outline' as const,
        onPress: () => navigation.navigate('Active'),
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
    mapCenter && hasLocation
      ? havDistance(mapCenter, { lat: locationLat!, lng: locationLng! }) > 10
      : false;

  const tabPad = theme.dimensions.tabBarHeight + insets.bottom;
  const offlineCollapsed = OFFLINE_PILL + tabPad;
  const offlineExpanded = OFFLINE_EXPANDED + tabPad;
  const onlineCollapsed = ONLINE_COLLAPSED + tabPad;
  const onlineExpanded = ONLINE_EXPANDED + tabPad;
  const recenterBottom = (isOnline ? onlineCollapsed : offlineCollapsed) + theme.spacing.md;

  const earningsAmountLabel = earnings ? formatCurrency(earnings.total) : '$0';

  const renderOfflineSheetBody = () => {
    if (!sheetExpanded) {
      if (earningsLoading) {
        return (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>Ganaste hoy</Text>
            <SkeletonCard style={styles.pillSkeleton} />
          </View>
        );
      }
      if (earningsIsError) {
        return (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>Ganaste hoy</Text>
            <TouchableOpacity onPress={() => refetchEarnings()} activeOpacity={0.7}>
              <Text style={styles.pillRetry}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={styles.pillRow}>
          <Text style={styles.pillLabel}>Ganaste hoy</Text>
          <Text style={styles.pillAmount}>{earningsAmountLabel}</Text>
        </View>
      );
    }

    if (earningsLoading) {
      return <SkeletonCard style={styles.expandedSkeleton} />;
    }

    if (earningsIsError) {
      const message =
        earningsError instanceof Error ? earningsError.message : 'Error al cargar ganancias';
      return (
        <View style={styles.expandedBlock}>
          <Text style={styles.metricsTitle}>Ganaste hoy</Text>
          <Text style={styles.errorText}>{message}</Text>
          <TouchableOpacity
            style={styles.earningsButton}
            onPress={() => refetchEarnings()}
            activeOpacity={0.8}
          >
            <Text style={styles.earningsButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.expandedBlock}>
        <Text style={styles.metricsTitle}>Ganaste hoy</Text>
        <Text style={styles.expandedAmount}>{earningsAmountLabel}</Text>
        {!earnings || earnings.total === 0 ? (
          <Text style={styles.earningsSubtext}>Todavia no hiciste viajes hoy</Text>
        ) : (
          <>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Efectivo</Text>
              <Text style={styles.metricValue}>{formatCurrency(earnings.cash)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Transferencia</Text>
              <Text style={styles.metricValue}>{formatCurrency(earnings.transfer)}</Text>
            </View>
            {shouldShowPlatformDebt(earnings.platform_debt) ? (
              <View style={styles.metricRow}>
                <Text style={[styles.metricLabel, { color: theme.colors.dangerRed }]}>
                  Deuda pendiente
                </Text>
                <Text style={[styles.metricValue, { color: theme.colors.dangerRed }]}>
                  -{formatCurrency(earnings.platform_debt)}
                </Text>
              </View>
            ) : null}
          </>
        )}
        <TouchableOpacity
          style={styles.earningsButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Earnings')}
        >
          <Text style={styles.earningsButtonText}>Ver ganancias</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />

      {hasLocation ? (
        <MapView
          style={StyleSheet.absoluteFill as object}
          followUserLocation
          centerCoordinate={[locationLng!, locationLat!]}
          userLocation={[locationLng!, locationLat!]}
          heatmapPoints={heatmapPoints}
          onMoveEnd={handleMapMove}
          recenterKey={recenterKey}
        />
      ) : (
        <View style={styles.mapLoading}>
          {locationError ? (
            <>
              <Text style={styles.mapErrorText}>{locationError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={async () => {
                  setRetryingLocation(true);
                  try {
                    await getCurrentPosition();
                  } finally {
                    setRetryingLocation(false);
                  }
                }}
                disabled={retryingLocation}
                accessibilityRole="button"
                accessibilityLabel="Reintentar ubicacion"
              >
                {retryingLocation ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={theme.colors.turquoise} />
              <Text style={styles.mapLoadingText}>Obteniendo ubicacion...</Text>
            </>
          )}
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

      {!isOnline && (
        <>
          <GoButton
            onPress={connect}
            loading={connecting}
            disabled={!hasLocation || connectBlocked || needsPayoutMethod || connecting}
          />
          {awaitingApproval && (
            <View style={styles.goHint}>
              <Text style={styles.reviewBannerText}>
                Cuenta en revisión. Podés mirar el mapa; te avisamos cuando puedas conectarte.
              </Text>
            </View>
          )}
          {!awaitingApproval && documentsPendingReview && (
            <View style={styles.goHint}>
              <Text style={styles.reviewBannerText}>
                Documentos pendientes de revision. No podes conectarte hasta tener los papeles en
                regla.
              </Text>
            </View>
          )}
          {toggleError && !isOnline && (
            <View style={styles.goHint}>
              <Text style={styles.errorText}>{toggleError}</Text>
            </View>
          )}
        </>
      )}

      {isOnline ? (
        <BottomSheet snapPoints={[onlineCollapsed, onlineExpanded]} onSnapChange={handleSnapChange}>
          <View style={[styles.sheetContent, { paddingBottom: tabPad }]}>
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
        <BottomSheet
          snapPoints={[offlineCollapsed, offlineExpanded]}
          onSnapChange={handleSnapChange}
        >
          <View style={[styles.sheetContent, { paddingBottom: tabPad }]}>
            {renderOfflineSheetBody()}
          </View>
        </BottomSheet>
      )}

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />

      {isOffCenter && (
        <TouchableOpacity
          style={[styles.recenterButton, { bottom: recenterBottom }]}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Ionicons name="locate-outline" size={24} color={theme.colors.turquoise} />
        </TouchableOpacity>
      )}

      <PayoutMethodGateModal
        visible={needsPayoutMethod && !isOnline}
        onAddMethod={() => {
          refreshPayoutMethods();
          navigation.navigate('PaymentMethod');
        }}
        onLogout={() => signOut.mutate()}
      />
      <Snackbar
        visible={connectFeedback != null}
        title={connectFeedback?.title ?? ''}
        message={connectFeedback?.message ?? ''}
        tone={(connectFeedback?.tone ?? 'error') as SnackbarTone}
        onDismiss={dismissConnectFeedback}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  goHint: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    top: '58%',
    zIndex: 7,
    alignItems: 'center',
  },
  reviewBannerText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pillRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  pillLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  pillAmount: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  pillSkeleton: {
    width: 96,
    height: 28,
  },
  pillRetry: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  expandedBlock: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  expandedAmount: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  expandedSkeleton: {
    width: '100%',
    height: 120,
  },
  earningsSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
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
  recenterButton: {
    position: 'absolute',
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
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  mapLoadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  mapErrorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.turquoise,
    minWidth: 120,
    alignItems: 'center',
  },
  retryBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
});
