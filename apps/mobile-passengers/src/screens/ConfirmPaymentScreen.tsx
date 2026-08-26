import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requestRide } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { type PaymentMethodType, usePaymentStore } from '../store/paymentStore';
import { theme } from '../theme';
import { formatCurrency } from '../utils/formatters';

const OPTIONS: {
  id: PaymentMethodType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'cash',
    title: 'Efectivo',
    subtitle: 'Pagás al conductor al finalizar',
    icon: 'cash-outline',
  },
  {
    id: 'transfer',
    title: 'Transferencia',
    subtitle: 'Transferís al CBU del conductor',
    icon: 'business-outline',
  },
];

export function ConfirmPaymentScreen() {
  const { goBack, navigate } = useAppNavigation();
  const defaultMethod = usePaymentStore((s) => s.methods.find((m) => m.isDefault)?.type ?? 'cash');
  const methods = usePaymentStore((s) => s.methods);
  const setDefault = usePaymentStore((s) => s.setDefault);

  const params = useLocalSearchParams<{
    pickup?: string;
    destination?: string;
    pickupLat?: string;
    pickupLng?: string;
    destLat?: string;
    destLng?: string;
    vehicleType?: string;
    fare?: string;
    distanceKm?: string;
    durationMin?: string;
  }>();

  const [selected, setSelected] = useState<PaymentMethodType>(
    defaultMethod === 'transfer' ? 'transfer' : 'cash',
  );
  const [loading, setLoading] = useState(false);

  const selectMethod = (type: PaymentMethodType) => {
    setSelected(type);
    const match = methods.find((m) => m.type === type && (type === 'cash' || m.isDefault));
    const fallback = methods.find((m) => m.type === type);
    const id = match?.id ?? fallback?.id;
    if (id) setDefault(id);
  };

  const coords = useMemo(() => {
    const origin_lat = Number(params.pickupLat);
    const origin_lng = Number(params.pickupLng);
    const dest_lat = Number(params.destLat);
    const dest_lng = Number(params.destLng);
    if ([origin_lat, origin_lng, dest_lat, dest_lng].some(Number.isNaN)) return null;
    return { origin_lat, origin_lng, dest_lat, dest_lng };
  }, [params.pickupLat, params.pickupLng, params.destLat, params.destLng]);

  const fare = Number(params.fare);
  const distanceKm = Number(params.distanceKm);
  const durationMin = Number(params.durationMin);
  const vehicleType = params.vehicleType === 'moto' ? 'moto' : 'auto';
  const canConfirm =
    coords != null &&
    !Number.isNaN(fare) &&
    !Number.isNaN(distanceKm) &&
    !Number.isNaN(durationMin);

  const handleConfirm = async () => {
    if (!canConfirm || !coords) return;
    setLoading(true);
    try {
      const trip = await requestRide({
        origin_lat: coords.origin_lat,
        origin_lng: coords.origin_lng,
        dest_lat: coords.dest_lat,
        dest_lng: coords.dest_lng,
        origin_address: params.pickup || '',
        dest_address: params.destination || '',
        vehicle_type: vehicleType,
        distance_km: distanceKm,
        duration_minutes: durationMin,
        payment_method: selected,
      });
      navigate('ConnectingDriver', { tripId: trip.id });
    } catch (err) {
      const data = (
        err as { response?: { data?: { error?: { message?: string }; message?: string } } }
      )?.response?.data;
      const message = data?.error?.message ?? data?.message ?? (err as Error).message;
      Alert.alert('No se pudo solicitar el viaje', message || 'Intentalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Método de pago</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>¿Cómo vas a pagar?</Text>
        <Text style={styles.subtitle}>
          Elegí una opción. El conductor confirmará el cobro al finalizar.
        </Text>

        {!Number.isNaN(fare) ? (
          <View style={styles.fareCard}>
            <Text style={styles.fareLabel}>Total estimado</Text>
            <Text style={styles.fareValue}>{formatCurrency(fare)}</Text>
          </View>
        ) : null}

        <View style={styles.options}>
          {OPTIONS.map((option) => {
            const active = selected === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionCard, active && styles.optionCardActive]}
                onPress={() => selectMethod(option.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                  <Ionicons
                    name={option.icon}
                    size={28}
                    color={active ? theme.colors.white : theme.colors.primary}
                  />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                    {option.title}
                  </Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={active ? theme.colors.primary : theme.colors.mediumGray}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Button
            variant="cta"
            onPress={handleConfirm}
            loading={loading}
            disabled={!canConfirm}
            style={styles.confirmBtn}
          >
            {!Number.isNaN(fare) ? `CONFIRMAR ${formatCurrency(fare)}` : 'CONFIRMAR'}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  fareCard: {
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
  fareValue: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  options: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.white,
    minHeight: 88,
  },
  optionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0, 194, 179, 0.06)',
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: theme.colors.primary,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  optionTitleActive: {
    color: theme.colors.deepBlue,
  },
  optionSubtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: theme.spacing.md,
  },
  confirmBtn: {
    width: '100%',
  },
});
