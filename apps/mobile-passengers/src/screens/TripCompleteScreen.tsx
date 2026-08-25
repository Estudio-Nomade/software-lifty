import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { rateRide } from '../api/passenger';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
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

export function TripCompleteScreen() {
  const { replace } = useAppNavigation();
  const trip = useRideStore((s) => s.activeTrip);
  const reset = useRideStore((s) => s.reset);
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rated, setRated] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSelectStars = (stars: number) => {
    if (submitting || rated) return;
    setRating(stars);
    setErrorText(null);
  };

  const handleSubmitRating = async () => {
    if (!trip?.id || rating === 0 || submitting || rated) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      await rateRide(trip.id, rating);
      setRated(true);
    } catch (err) {
      const { code, message } = getErrorMessage(err);
      // Backend is idempotent, but older servers may still return CONFLICT.
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
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
    backgroundColor: theme.colors.lightGray,
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
  stars: { flexDirection: 'row', gap: theme.spacing.sm },
  errorText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  button: { width: '100%', marginTop: theme.spacing.sm },
});
