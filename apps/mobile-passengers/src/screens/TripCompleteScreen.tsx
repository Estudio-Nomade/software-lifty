import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { rateRide, setTripPaymentMethod } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { type PaymentMethodType, usePaymentStore } from '../store/paymentStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';

const formatCurrency = (value: number | null | undefined) =>
  value == null ? '—' : `$${value.toLocaleString('es-AR')}`;

function getErrorMessage(err: unknown): { code?: string; message: string } {
  const data = (
    err as {
      response?: { data?: { error?: { code?: string; message?: string }; message?: string } };
      message?: string;
    }
  )?.response?.data;
  const code = data?.error?.code;
  const message =
    data?.error?.message ??
    data?.message ??
    (err as Error)?.message ??
    'No se pudo enviar la calificación.';
  return { code, message };
}

function paymentTitle(type: PaymentMethodType): string {
  return type === 'transfer' ? 'Transferencia' : 'Efectivo';
}

export function TripCompleteScreen() {
  const { replace } = useAppNavigation();
  const trip = useRideStore((s) => s.activeTrip);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const reset = useRideStore((s) => s.reset);
  const storeDefault = usePaymentStore((s) => s.methods.find((m) => m.isDefault)?.type ?? 'cash');

  const initialMethod: PaymentMethodType =
    trip?.payment_method === 'transfer' || trip?.payment_method === 'cash'
      ? trip.payment_method
      : storeDefault === 'transfer'
        ? 'transfer'
        : 'cash';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(initialMethod);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rated, setRated] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleConfirmPayment = async () => {
    if (!trip?.id || confirmingPayment) return;
    setConfirmingPayment(true);
    setErrorText(null);
    try {
      if (trip.payment_method !== paymentMethod) {
        const updated = await setTripPaymentMethod(trip.id, paymentMethod);
        setActiveTrip(updated);
      }
      setPaymentConfirmed(true);
    } catch (err) {
      const { message } = getErrorMessage(err);
      // Still allow continue if endpoint fails (e.g. already collected).
      setPaymentConfirmed(true);
      if (message) setErrorText(message);
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleSelectStars = (stars: number) => {
    if (submitting || rated || !paymentConfirmed) return;
    setRating(stars);
    setErrorText(null);
  };

  const handleSubmitRating = async () => {
    if (!trip?.id || rating === 0 || submitting || rated || !paymentConfirmed) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      await rateRide(trip.id, rating);
      setRated(true);
    } catch (err) {
      const { code, message } = getErrorMessage(err);
      if (code === 'CONFLICT') {
        setRated(true);
        return;
      }
      if (code === 'BAD_REQUEST' && /completed/i.test(message)) {
        setErrorText('El viaje aún no está listo para calificar. Intentá en un momento.');
      } else {
        setErrorText(message);
      }
      Alert.alert('No se pudo calificar', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = () => {
    reset();
    replace('Home');
  };

  const driverName = trip?.driver_name ?? 'Tu conductor';
  const routeLabel = [trip?.origin_address, trip?.dest_address].filter(Boolean).join(' → ');

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
            <Text style={styles.title}>¡Viaje completado!</Text>
            <Text style={styles.amount}>{formatCurrency(trip?.total_fare)}</Text>
            {routeLabel ? <Text style={styles.subtitle}>{routeLabel}</Text> : null}

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Distancia</Text>
                <Text style={styles.detailValue}>
                  {trip?.distance_km != null ? `${trip.distance_km} km` : '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Duración</Text>
                <Text style={styles.detailValue}>
                  {trip?.duration_minutes != null ? `${trip.duration_minutes} min` : '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Conductor</Text>
                <Text style={styles.detailValue}>{driverName}</Text>
              </View>
            </View>

            {!paymentConfirmed ? (
              <>
                <Text style={styles.rateTitle}>Confirmá el pago</Text>
                <Text style={styles.paymentHint}>¿Cómo pagaste este viaje?</Text>
                <View style={styles.paymentOptions}>
                  {(['cash', 'transfer'] as const).map((type) => {
                    const active = paymentMethod === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.paymentChip, active && styles.paymentChipActive]}
                        onPress={() => setPaymentMethod(type)}
                        disabled={confirmingPayment}
                      >
                        <Ionicons
                          name={type === 'cash' ? 'cash-outline' : 'business-outline'}
                          size={18}
                          color={active ? theme.colors.white : theme.colors.deepBlue}
                        />
                        <Text
                          style={[styles.paymentChipText, active && styles.paymentChipTextActive]}
                        >
                          {paymentTitle(type)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
                <Button
                  variant="primary"
                  onPress={handleConfirmPayment}
                  loading={confirmingPayment}
                  disabled={confirmingPayment}
                  style={styles.button}
                >
                  CONFIRMAR PAGO
                </Button>
              </>
            ) : (
              <>
                <View style={styles.paidBadge}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  <Text style={styles.paidBadgeText}>
                    Pago confirmado · {paymentTitle(paymentMethod)}
                  </Text>
                </View>

                <Text style={styles.rateTitle}>
                  {rated ? '¡Gracias por calificar!' : '¿Cómo fue tu viaje?'}
                </Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity
                      key={s}
                      disabled={submitting || rated}
                      onPress={() => handleSelectStars(s)}
                      accessibilityLabel={`${s} estrellas`}
                    >
                      <Ionicons
                        name={s <= rating ? 'star' : 'star-outline'}
                        size={32}
                        color={s <= rating ? theme.colors.amber : theme.colors.mediumGray}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

                {!rated ? (
                  <Button
                    variant="primary"
                    onPress={handleSubmitRating}
                    loading={submitting}
                    disabled={rating === 0 || submitting}
                    style={styles.button}
                  >
                    ENVIAR CALIFICACIÓN
                  </Button>
                ) : null}

                <Button
                  variant={rated ? 'primary' : 'secondary'}
                  onPress={handleFinish}
                  disabled={submitting}
                  style={styles.button}
                >
                  {rated ? 'VOLVER AL INICIO' : 'OMITIR'}
                </Button>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  amount: {
    fontSize: theme.fontSize['4xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  detailCard: {
    width: '100%',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  detailValue: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  rateTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.md,
  },
  paymentHint: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  paymentChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.white,
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
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 194, 179, 0.1)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
  },
  paidBadgeText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
  stars: { flexDirection: 'row', gap: theme.spacing.sm },
  errorText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  button: { width: '100%', marginTop: theme.spacing.sm },
});
