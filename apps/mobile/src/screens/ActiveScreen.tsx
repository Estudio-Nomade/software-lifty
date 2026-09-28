import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { apiClient, getValidated } from '../api/client';
import { driverStatusSchema, earningsDailySchema } from '../api/types';
import type { DriverStatus, EarningsDaily } from '../api/types';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { DistrictPickerSheet } from '../components/DistrictPickerSheet';
import { GoButton } from '../components/GoButton';
import { MapView } from '../components/MapView';
import { PayoutMethodGateModal } from '../components/PayoutMethodGateModal';
import { Toggle } from '../components/Toggle';
import { bottomSheetExpandedHeight } from '../components/bottomSheetMath';
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
import { getCurrentPosition, startTracking, stopTracking } from '../lib/location';
import {
  hasDistrictFromCache,
  isDistrictRequiredError,
  shouldOpenDistrictPicker,
} from '../lib/shouldOpenDistrictPicker';
import { useLocationStore } from '../store/locationStore';
import { ONLINE_SINCE_KEY, useOnlineStore } from '../store/onlineStore';
import { useVehicleStore } from '../store/vehicleStore';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Collapsed: handle + one peeker line above tabs (invite to pull up). */
const SHEET_COLLAPSED = 56;
/** Gap between GO+hint stack bottom and collapsed offline sheet top. */
const GO_STACK_SHEET_GAP = theme.spacing.sm;

/** Soft stickers/tránsito copy — full offline under GO; short chip while online. */
const stickersReminderCopy = (opts: {
  phase: DriverStatus['identification_phase'];
  daysUntilPause: number | null | undefined;
  daysSinceApproval: number | null | undefined;
  compact?: boolean;
}): string => {
  const daysLeft = opts.daysUntilPause != null ? ` (quedan ${opts.daysUntilPause} días)` : '';
  if (opts.compact) {
    if (opts.phase === 'reminder') {
      return opts.daysUntilPause != null
        ? `Stickers: retirá en tránsito · quedan ${opts.daysUntilPause} días`
        : 'Stickers: retirá en tránsito antes de los 30 días';
    }
    return opts.daysUntilPause != null
      ? `Retirá stickers en tránsito · ${opts.daysUntilPause} días`
      : 'Retirá stickers / identificación en tránsito';
  }
  if (opts.phase === 'reminder') {
    return `Recordatorio: ya pasaron ${opts.daysSinceApproval ?? 20}+ días. Retirá los stickers en tránsito; a los 30 días se suspende la cuenta${daysLeft}.`;
  }
  return `Recordá retirar los stickers / identificación en tránsito. Tenés 30 días desde la aprobación; después se suspende la cuenta${daysLeft}.`;
};

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
  const queryClient = useQueryClient();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const setOnline = useOnlineStore((s) => s.setOnline);
  const onlineSince = useOnlineStore((s) => s.onlineSince);
  const setOnlineSince = useOnlineStore((s) => s.setOnlineSince);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [connectFeedback, setConnectFeedback] = useState<ConnectBlockedFeedback | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [districtSheetVisible, setDistrictSheetVisible] = useState(false);
  const heatmapPoints = useHeatmapPolling();
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [onlineTime, setOnlineTime] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [retryingLocation, setRetryingLocation] = useState(false);
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
  const identificationPhase = driverStatus?.identification_phase;
  const stickersPendingPickup =
    driverStatus?.status === 'approved' &&
    driverStatus?.identification_status != null &&
    driverStatus.identification_status !== 'issued' &&
    identificationPhase !== 'issued';
  const stickersPaused =
    identificationPhase === 'paused' ||
    (driverStatus?.identification_blocks_online === true &&
      driverStatus?.identification_status === 'pending_pickup');
  const stickersRevoked =
    identificationPhase === 'revoked' || driverStatus?.identification_status === 'revoked';
  // Soft reminder during grace/reminder — does NOT block GO.
  const stickersReminder =
    stickersPendingPickup &&
    !stickersPaused &&
    !stickersRevoked &&
    (driverStatus?.identification_show_reminder ?? true);
  const { needsPayoutMethod, refreshPayoutMethods } = usePayoutMethodGate(driverStatus);
  const signOut = useSignOut();

  useFocusEffect(
    useCallback(() => {
      refreshPayoutMethods();
      // Warm GPS on home (cold start + return from other screens). Offline map needs
      // a live watch; online tracking is also owned by LocationSync (idempotent).
      void getCurrentPosition();
      void startTracking();
      return () => {
        if (!useOnlineStore.getState().isOnline) {
          void stopTracking();
        }
      };
    }, [refreshPayoutMethods]),
  );

  // After disconnect, LocationSync stops the watch — restart so the map keeps following.
  useEffect(() => {
    if (isOnline) return;
    void getCurrentPosition();
    void startTracking();
  }, [isOnline]);

  const awaitingApproval =
    driverStatus?.status === 'under_review' || driverStatus?.step === 'review';
  const municipalityWaitlisted =
    driverStatus?.municipality_status === 'waitlisted' ||
    driverStatus?.show_municipality_waitlist_banner === true;
  const connectBlocked =
    documentsPendingReview ||
    awaitingApproval ||
    stickersPaused ||
    stickersRevoked ||
    municipalityWaitlisted;

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

    if (municipalityWaitlisted) {
      showConnectFeedback(feedbackForConnectBlock('municipality_waitlisted'));
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

    if (stickersRevoked) {
      showConnectFeedback(feedbackForConnectBlock('stickers_revoked'));
      return;
    }

    if (stickersPaused) {
      showConnectFeedback(feedbackForConnectBlock('stickers_overdue'));
      return;
    }

    if (!hasLocation) {
      showConnectFeedback(feedbackForConnectBlock('no_location'));
      return;
    }

    const latest = queryClient.getQueryData<DriverStatus>(['driverStatus']);
    if (shouldOpenDistrictPicker({ hasDistrict: hasDistrictFromCache(latest) })) {
      setDistrictSheetVisible(true);
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
      if (isDistrictRequiredError(err)) {
        setDistrictSheetVisible(true);
        return;
      }
      showConnectFeedback(feedbackFromConnectError(err));
    } finally {
      setConnecting(false);
    }
  }, [
    awaitingApproval,
    documentsPendingReview,
    stickersPaused,
    stickersRevoked,
    hasLocation,
    needsPayoutMethod,
    municipalityWaitlisted,
    queryClient,
    setOnline,
    setOnlineSince,
    showConnectFeedback,
  ]);

  const handleDistrictAssigned = useCallback(async () => {
    setDistrictSheetVisible(false);
    // Lock GO for the whole refetch→connect window so a second tap cannot race.
    // Refetch must finish before connect so getQueryData(['driverStatus']) is fresh
    // (has_district true) and shouldOpenDistrictPicker does not reopen the sheet.
    setConnecting(true);
    try {
      await queryClient.refetchQueries({ queryKey: ['driverStatus'] });
      await connect();
    } finally {
      setConnecting(false);
    }
  }, [connect, queryClient]);

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

  const isOffCenter =
    mapCenter && hasLocation
      ? havDistance(mapCenter, { lat: locationLat!, lng: locationLng! }) > 10
      : false;

  // Tab bar is its own absolute layer (zIndex 1000). Sheet sits ON TOP of it via bottomOffset.
  const tabPad = theme.dimensions.tabBarHeight + insets.bottom;
  // ~55% of map area; ScrollView covers overflow (Ver ganancias, etc.).
  const expandedHeight = Math.max(
    SHEET_COLLAPSED + 160,
    bottomSheetExpandedHeight(SCREEN_HEIGHT, tabPad, 0.55),
  );
  const collapsedHeight = SHEET_COLLAPSED;
  // Floor of the visible collapsed strip (above tabs) — GO / recenter / snackbar.
  const sheetFloor = collapsedHeight + tabPad;
  const goStackBottom = sheetFloor + GO_STACK_SHEET_GAP;
  const recenterBottom = sheetFloor + theme.spacing.md;

  const earningsAmountLabel = earnings ? formatCurrency(earnings.total) : '$0';

  const onlinePeekerLabel = stickersReminder
    ? stickersReminderCopy({
        phase: identificationPhase,
        daysUntilPause: driverStatus?.identification_days_until_pause,
        daysSinceApproval: driverStatus?.identification_days_since_approval,
        compact: true,
      })
    : 'Resumen de hoy';

  const offlinePeekerLabel = earningsLoading
    ? 'Ganaste hoy'
    : earningsIsError
      ? 'Ganaste hoy · reintentar'
      : `Ganaste hoy ${earningsAmountLabel}`;

  const renderOfflineSheetBody = () => {
    if (!sheetExpanded) {
      return null;
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
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

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

      <View
        style={[styles.headerOverlay, { paddingTop: insets.top + theme.spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.headerRight} pointerEvents="box-none">
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
            style={styles.floatingAvatar}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Ir a perfil"
          >
            <Avatar uri={profile?.avatar_url ?? null} name={profile?.full_name ?? ''} size={44} />
          </TouchableOpacity>
        </View>
      </View>

      {!isOnline && (
        <View style={[styles.goStack, { bottom: goStackBottom }]} pointerEvents="box-none">
          <GoButton
            onPress={connect}
            loading={connecting}
            disabled={!hasLocation || connectBlocked || needsPayoutMethod || connecting}
            embedded
          />
          {municipalityWaitlisted && (
            <View style={styles.goHint} pointerEvents="none">
              <Text style={styles.reviewBannerTitle}>Municipio no habilitado</Text>
              <Text style={styles.reviewBannerText}>
                {`Tu domicilio figura en ${
                  [driverStatus?.address_resolved_city, driverStatus?.address_resolved_province]
                    .filter(Boolean)
                    .join(', ') || 'una zona sin cobertura'
                }. Lifty todavía no habilita viajes ahí. Te avisamos cuando abramos tu zona.`}
              </Text>
            </View>
          )}
          {!municipalityWaitlisted && awaitingApproval && (
            <View style={styles.goHint} pointerEvents="none">
              <Text style={styles.reviewBannerText}>
                Cuenta en revisión. Podés mirar el mapa; te avisamos cuando puedas conectarte.
              </Text>
            </View>
          )}
          {!municipalityWaitlisted && !awaitingApproval && documentsPendingReview && (
            <View style={styles.goHint} pointerEvents="none">
              <Text style={styles.reviewBannerText}>
                Documentos pendientes de revisión. No podés conectarte hasta tener los papeles en
                regla.
              </Text>
            </View>
          )}
          {!municipalityWaitlisted &&
            !awaitingApproval &&
            !documentsPendingReview &&
            stickersPaused && (
              <View style={styles.goHint} pointerEvents="none">
                <Text style={styles.reviewBannerText}>
                  Cuenta suspendida: pasaron 30 días sin retirar los stickers en tránsito. Retiralos
                  en tu municipio para reactivar la cuenta.
                </Text>
              </View>
            )}
          {!municipalityWaitlisted &&
            !awaitingApproval &&
            !documentsPendingReview &&
            stickersRevoked &&
            !stickersPaused && (
              <View style={styles.goHint} pointerEvents="none">
                <Text style={styles.reviewBannerText}>
                  Tu identificación fue revocada. Contactá a soporte o tránsito de tu municipio.
                </Text>
              </View>
            )}
          {!municipalityWaitlisted &&
            !awaitingApproval &&
            !documentsPendingReview &&
            stickersReminder &&
            !stickersPaused &&
            !stickersRevoked && (
              <View style={styles.goHint} pointerEvents="none">
                <Text style={styles.reviewBannerText}>
                  {stickersReminderCopy({
                    phase: identificationPhase,
                    daysUntilPause: driverStatus?.identification_days_until_pause,
                    daysSinceApproval: driverStatus?.identification_days_since_approval,
                  })}
                </Text>
              </View>
            )}
          {toggleError && (
            <View style={styles.goHint} pointerEvents="none">
              <Text style={styles.errorText}>{toggleError}</Text>
            </View>
          )}
        </View>
      )}

      {isOnline ? (
        <BottomSheet
          snapPoints={[collapsedHeight, expandedHeight]}
          bottomOffset={tabPad}
          peekerLabel={onlinePeekerLabel}
          onSnapChange={handleSnapChange}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            scrollEnabled={sheetExpanded}
            bounces={sheetExpanded}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.toggleRow}>
              <Text style={styles.statusOnline}>Estas conectado</Text>
              <Toggle value={true} onToggle={handleToggle} />
            </View>
            <Text style={styles.statusOnlineTime}>{formatOnlineTime(onlineTime)}</Text>
            {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}

            {stickersReminder && !stickersPaused && !stickersRevoked && (
              <View
                style={styles.onlineStickersChip}
                accessibilityRole="text"
                accessibilityLabel="Recordatorio stickers en tránsito"
              >
                <Ionicons name="pricetag-outline" size={14} color={theme.colors.deepBlue} />
                <Text style={styles.onlineStickersChipText} numberOfLines={2}>
                  {stickersReminderCopy({
                    phase: identificationPhase,
                    daysUntilPause: driverStatus?.identification_days_until_pause,
                    daysSinceApproval: driverStatus?.identification_days_since_approval,
                    compact: true,
                  })}
                </Text>
              </View>
            )}

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
          </ScrollView>
        </BottomSheet>
      ) : (
        <BottomSheet
          snapPoints={[collapsedHeight, expandedHeight]}
          bottomOffset={tabPad}
          peekerLabel={offlinePeekerLabel}
          onSnapChange={handleSnapChange}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            scrollEnabled={sheetExpanded}
            bounces={sheetExpanded}
            showsVerticalScrollIndicator={false}
          >
            {renderOfflineSheetBody()}
          </ScrollView>
        </BottomSheet>
      )}

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
      <DistrictPickerSheet
        visible={districtSheetVisible}
        onDismiss={() => setDistrictSheetVisible(false)}
        onAssigned={() => {
          void handleDistrictAssigned();
        }}
      />
      <Snackbar
        visible={connectFeedback != null}
        title={connectFeedback?.title ?? ''}
        message={connectFeedback?.message ?? ''}
        tone={(connectFeedback?.tone ?? 'error') as SnackbarTone}
        bottomOffset={sheetFloor + theme.spacing.sm}
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
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
    paddingVertical: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  connectedBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: theme.fontWeight.medium,
  },
  floatingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  goStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    zIndex: 6,
  },
  goHint: {
    width: '100%',
    alignItems: 'center',
    zIndex: 7,
  },
  onlineStickersChip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.full,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.surfaceMuted,
    marginTop: theme.spacing.xs,
  },
  onlineStickersChipText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  reviewBannerTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderTopLeftRadius: theme.radius.sm,
    borderTopRightRadius: theme.radius.sm,
    overflow: 'hidden',
    width: '100%',
  },
  reviewBannerText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.surfaceMuted,
  },
  sheetScroll: {
    flex: 1,
    width: '100%',
  },
  sheetScrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.surfaceMuted,
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
    backgroundColor: theme.colors.surface,
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
