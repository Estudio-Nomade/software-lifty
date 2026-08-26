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
import { estimateFare } from '../api/passenger';
import type { FareEstimate } from '../api/types';
import { Button } from '../components/Button';
import { PassengerMap } from '../components/Map/PassengerMap';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { toMapCoordinate } from '../hooks/useLocation';
import { useLocationStore } from '../store/locationStore';
import { type PaymentMethodType, usePaymentStore } from '../store/paymentStore';
import { theme } from '../theme';
import { formatCurrency } from '../utils/formatters';

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

function paramText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function VehicleSelectScreen() {
  const { goBack, navigate } = useAppNavigation();
  const current = useLocationStore((s) => s.current);
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
      Alert.alert('Ubicación no disponible', 'No pudimos obtener tu ubicación. Reintentá.');
      return;
    }

    let cancelled = false;
    setFares({});

    (async () => {
      const results = await Promise.allSettled([
        estimateFare({ ...coords, vehicle_type: 'auto' }),
        estimateFare({ ...coords, vehicle_type: 'moto' }),
      ]);
      if (cancelled) return;

      const next: Partial<Record<Vehicle['id'], FareEstimate>> = {};
      let anyFailed = false;
      results.forEach((result, index) => {
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
      ? `CONTINUAR ${formatCurrency(selectedEstimate.fare)}`
      : 'CONTINUAR';

  const selectPayment = (type: PaymentMethodType) => {
    const preferredId = type === 'cash' ? 'cash' : 'transfer';
    const match = methods.find((m) => m.id === preferredId) ?? methods.find((m) => m.type === type);
    if (match) setDefault(match.id);
  };

  const handleContinue = () => {
    if (!coords || !selectedEstimate) return;
    navigate('ConfirmPayment', {
      pickup: pickup || '',
      destination: destination || '',
      pickupLat: String(coords.origin_lat),
      pickupLng: String(coords.origin_lng),
      destLat: String(coords.dest_lat),
      destLng: String(coords.dest_lng),
      vehicleType: selected,
      fare: String(selectedEstimate.fare),
      distanceKm: String(selectedEstimate.distance_km),
      durationMin: String(selectedEstimate.duration_min),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn}>
          <Ionicons name="close" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <PassengerMap
          centerCoordinate={current ? toMapCoordinate(current.lat, current.lng) : [0, 0]}
          userLocation={current ? toMapCoordinate(current.lat, current.lng) : null}
          followUserLocation
          style={styles.mapFill}
        />
      </View>

      <View style={styles.routeSummary}>
        <Ionicons name="location-outline" size={16} color={theme.colors.dangerRed} />
        <Text style={styles.routeAddr} numberOfLines={1}>
          {pickup || 'Origen'}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={theme.colors.mediumGray} />
        <Ionicons name="navigate-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.routeAddr} numberOfLines={1}>
          {destination || 'Destino'}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Selecciona tu vehículo</Text>

        {VEHICLES.map((v) => {
          const estimate = fares[v.id];
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
                      {estimate ? `${estimate.duration_min} min` : '—'}
                    </Text>
                  </View>
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

          <Button
            variant="cta"
            onPress={handleContinue}
            disabled={!selectedEstimate}
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
    backgroundColor: theme.colors.lightGray,
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
    height: 160,
    backgroundColor: theme.colors.lightGray,
  },
  mapFill: {
    flex: 1,
  },
  routeSummary: {
    height: 48,
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
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
