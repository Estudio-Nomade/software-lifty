import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { estimateFare, getDirections, requestRide } from '../api/passenger';
import type { FareEstimate } from '../api/types';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import type { MarkerData } from '../components/Map/mapHtml';
import { RequestBlockedCard } from '../components/RequestBlockedCard';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { toMapCoordinate } from '../hooks/useLocation';
import { decodePolyline } from '../lib/polyline';
import { type RideRequestErrorInfo, parseRideRequestError } from '../lib/rideRequestErrors';
import { type PaymentMethodType, usePaymentStore } from '../store/paymentStore';
import { theme } from '../theme';
import { formatCurrency, formatDistanceKm, formatDurationMin } from '../utils/formatters';

interface Vehicle {
  id: 'auto' | 'moto';
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  capacity: string;
}

const VEHICLES: Vehicle[] = [
  { id: 'auto', name: 'Auto', icon: 'car-outline', capacity: '4 pasajeros' },
  { id: 'moto', name: 'Moto', icon: 'bicycle-outline', capacity: '1 pasajero' },
];

const PAYMENT_OPTIONS: {
  type: PaymentMethodType;
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { type: 'cash', id: 'cash', title: 'Efectivo', icon: 'cash-outline' },
  { type: 'transfer', id: 'transfer', title: 'Transferencia', icon: 'business-outline' },
];

type RoutePreview = {
  distance_km: number;
  duration_minutes: number;
  line: Array<[number, number]>;
};

type RouteStatus = 'idle' | 'loading' | 'ok' | 'error';

function paramText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function VehicleSelectScreen() {
  const { goBack, replace, navigate } = useAppNavigation();
  const methods = usePaymentStore((s) => s.methods);
  const setDefault = usePaymentStore((s) => s.setDefault);
  const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];
  const selectedPaymentType: PaymentMethodType =
    defaultMethod?.type === 'transfer' ? 'transfer' : 'cash';

  const params = useLocalSearchParams<{
    pickup?: string;
    destination?: string;
    pickupLat?: string;
    pickupLng?: string;
    destLat?: string;
    destLng?: string;
  }>();
  const pickup = paramText(params.pickup);
  const destination = paramText(params.destination);
  const [selected, setSelected] = useState<Vehicle['id']>('auto');
  const [fares, setFares] = useState<Partial<Record<Vehicle['id'], FareEstimate>>>({});
  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<RideRequestErrorInfo | null>(null);

  const coords = useMemo(() => {
    const origin_lat = Number(paramText(params.pickupLat));
    const origin_lng = Number(paramText(params.pickupLng));
    const dest_lat = Number(paramText(params.destLat));
    const dest_lng = Number(paramText(params.destLng));
    if ([origin_lat, origin_lng, dest_lat, dest_lng].some(Number.isNaN)) return null;
    return { origin_lat, origin_lng, dest_lat, dest_lng };
  }, [params.pickupLat, params.pickupLng, params.destLat, params.destLng]);

  useEffect(() => {
    if (!coords) {
      setFares({});
      setRoute(null);
      setRouteStatus('idle');
      Alert.alert('Ubicación no disponible', 'No pudimos obtener tu ubicación. Reintentá.');
      return;
    }

    let cancelled = false;
    setFares({});
    setRoute(null);
    setRouteStatus('loading');

    (async () => {
      const [directionsResult, ...fareResults] = await Promise.allSettled([
        getDirections(coords),
        estimateFare({ ...coords, vehicle_type: 'auto' }),
        estimateFare({ ...coords, vehicle_type: 'moto' }),
      ]);
      if (cancelled) return;

      if (directionsResult.status === 'fulfilled') {
        const d = directionsResult.value;
        const line = decodePolyline(d.polyline);
        setRoute({
          distance_km: d.distance_km,
          duration_minutes: d.duration_minutes,
          line,
        });
        setRouteStatus(line.length >= 2 ? 'ok' : 'error');
      } else {
        console.error('[VehicleSelect] directions failed', directionsResult.reason);
        setRoute(null);
        setRouteStatus('error');
      }

      const next: Partial<Record<Vehicle['id'], FareEstimate>> = {};
      let anyFailed = false;
      fareResults.forEach((result, index) => {
        const id: Vehicle['id'] = index === 0 ? 'auto' : 'moto';
        if (result.status === 'fulfilled') {
          next[id] = result.value;
        } else {
          anyFailed = true;
          console.error('[VehicleSelect] fare estimate failed', result.reason);
        }
      });

      setFares(next);
      if (anyFailed) {
        Alert.alert('No pudimos calcular la tarifa', 'Reintentá más tarde.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords]);

  const selectedEstimate = fares[selected];
  const continueLabel =
    selectedEstimate != null && Number.isFinite(selectedEstimate.fare)
      ? `Continuar · ${formatCurrency(selectedEstimate.fare)}`
      : 'Continuar';

  const summaryDistanceKm =
    route?.distance_km ?? fares.auto?.distance_km ?? fares.moto?.distance_km ?? null;
  const summaryDurationMin =
    route?.duration_minutes ?? fares.auto?.duration_min ?? fares.moto?.duration_min ?? null;

  const mapMarkers: MarkerData[] = useMemo(() => {
    if (!coords) return [];
    return [
      {
        id: 'origin',
        coordinate: [coords.origin_lng, coords.origin_lat],
        color: theme.colors.deepBlue,
        title: 'Origen',
      },
      {
        id: 'dest',
        coordinate: [coords.dest_lng, coords.dest_lat],
        color: theme.colors.dangerRed,
        icon: 'destination',
        title: 'Destino',
      },
    ];
  }, [coords]);

  const mapCenter = useMemo((): [number, number] => {
    if (!coords) return [0, 0];
    return toMapCoordinate(
      (coords.origin_lat + coords.dest_lat) / 2,
      (coords.origin_lng + coords.dest_lng) / 2,
    );
  }, [coords]);

  const selectPayment = (type: PaymentMethodType) => {
    const preferredId = type === 'cash' ? 'cash' : 'transfer';
    const match = methods.find((m) => m.id === preferredId) ?? methods.find((m) => m.type === type);
    if (match) setDefault(match.id);
  };

  const handleContinue = async () => {
    if (!coords || !selectedEstimate || loading) return;
    setBlocked(null);
    setLoading(true);
    try {
      const trip = await requestRide({
        origin_lat: Number(coords.origin_lat),
        origin_lng: Number(coords.origin_lng),
        dest_lat: Number(coords.dest_lat),
        dest_lng: Number(coords.dest_lng),
        origin_address: pickup || 'Origen',
        dest_address: destination || 'Destino',
        vehicle_type: selected,
        distance_km: Number(selectedEstimate.distance_km),
        duration_minutes: Number(selectedEstimate.duration_min),
        payment_method: selectedPaymentType,
      });
      replace('ConnectingDriver', { tripId: String(trip.id) });
    } catch (err) {
      console.error('[VehicleSelect] requestRide failed', err);
      const info = parseRideRequestError(err);
      setBlocked(info);
      if (info.code === 'UNKNOWN') {
        Alert.alert(info.title, info.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const routeChipLabel = (() => {
    if (routeStatus === 'loading') return 'Calculando ruta…';
    if (summaryDistanceKm != null || summaryDurationMin != null) {
      return `${formatDistanceKm(summaryDistanceKm)} · ${formatDurationMin(summaryDurationMin)}`;
    }
    if (routeStatus === 'error') return 'No pudimos trazar la ruta';
    return '—';
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn}>
          <Ionicons name="close" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <PassengerMap
          centerCoordinate={mapCenter}
          userLocation={null}
          followUserLocation={false}
          markers={mapMarkers}
          routeLine={route?.line ?? []}
          style={styles.mapFill}
        />
      </View>

      <View style={styles.routeSummary}>
        <View style={styles.routeChip}>
          <Ionicons name="navigate-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.routeChipText}>{routeChipLabel}</Text>
        </View>
        <View style={styles.routeAddrs}>
          <Ionicons name="location-outline" size={16} color={theme.colors.deepBlue} />
          <Text style={styles.routeAddr} numberOfLines={1}>
            {pickup || 'Origen'}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={theme.colors.mediumGray} />
          <Ionicons name="flag-outline" size={16} color={theme.colors.dangerRed} />
          <Text style={styles.routeAddr} numberOfLines={1}>
            {destination || 'Destino'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Seleccioná tu vehículo</Text>

        {VEHICLES.map((v) => {
          const estimate = fares[v.id];
          const cardKm = route?.distance_km ?? estimate?.distance_km;
          return (
            <TouchableOpacity
              key={v.id}
              style={[styles.vehicleCard, selected === v.id && styles.vehicleSelected]}
              onPress={() => setSelected(v.id)}
            >
              <Ionicons name={v.icon} size={28} color={theme.colors.deepBlue} />
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleName}>{v.name}</Text>
                <View style={styles.vehicleMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={theme.colors.mediumGray} />
                    <Text style={styles.vehicleDetail}>
                      {estimate ? formatDurationMin(estimate.duration_min) : '—'}
                    </Text>
                  </View>
                  {cardKm != null ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="resize-outline" size={12} color={theme.colors.mediumGray} />
                      <Text style={styles.vehicleDetail}>{formatDistanceKm(cardKm)}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.vehicleDetail}>{v.capacity}</Text>
                </View>
              </View>
              <Text style={styles.vehiclePrice}>
                {estimate ? formatCurrency(estimate.fare) : '—'}
              </Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.footer}>
          {destination ? (
            <View style={styles.footerRow}>
              <Ionicons name="navigate-outline" size={16} color={theme.colors.mediumGray} />
              <Text style={styles.footerLabel}>Hacia</Text>
              <Text style={styles.footerAddr} numberOfLines={1}>
                {destination}
              </Text>
            </View>
          ) : null}

          <Text style={styles.paymentTitle}>Forma de pago</Text>
          <View style={styles.paymentOptions}>
            {PAYMENT_OPTIONS.map((opt) => {
              const active = selectedPaymentType === opt.type;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.paymentChip, active && styles.paymentChipActive]}
                  onPress={() => selectPayment(opt.type)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.title}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={active ? theme.colors.white : theme.colors.deepBlue}
                  />
                  <Text style={[styles.paymentChipText, active && styles.paymentChipTextActive]}>
                    {opt.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {blocked ? (
            <RequestBlockedCard
              info={blocked}
              onOpenHistory={() => navigate('TripHistory')}
              onOpenSupport={() => navigate('Support')}
            />
          ) : null}

          <Button
            variant="cta"
            onPress={() => {
              void handleContinue();
            }}
            loading={loading}
            disabled={!selectedEstimate || loading}
            style={styles.solicitarBtn}
          >
            {continueLabel}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navbar: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  navBtn: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
  },
  mapContainer: {
    minHeight: 280,
    height: '38%',
    backgroundColor: theme.colors.background,
  },
  mapFill: {
    flex: 1,
  },
  routeSummary: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  routeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  routeChipText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  routeAddrs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  routeAddr: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    flex: 1,
    minWidth: 0,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  vehicleSelected: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  vehicleName: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  vehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleDetail: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  vehiclePrice: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  footerLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
  footerAddr: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  paymentTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.xs,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  paymentChip: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 12,
  },
  paymentChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  paymentChipText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  paymentChipTextActive: {
    color: theme.colors.white,
  },
  solicitarBtn: {
    width: '100%',
    marginTop: theme.spacing.xs,
  },
});
