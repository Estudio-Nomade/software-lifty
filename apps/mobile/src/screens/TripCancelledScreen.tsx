import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

interface CancelCopy {
  title: string;
  tvf: string;
}

const COPY: Record<string, CancelCopy> = {
  user_cancel: {
    title: 'El pasajero canceló el viaje',
    tvf: 'Esta cancelación no afecta tu TVF',
  },
  driver_cancel: {
    title: 'Cancelaste el viaje',
    tvf: 'Esta cancelación sí afecta tu TVF',
  },
  no_show: {
    title: 'Cancelaste por no-show',
    tvf: 'Esta cancelación no afecta tu TVF',
  },
  auto_timeout: {
    title: 'No se encontró pasajero / se canceló la búsqueda',
    tvf: 'No afecta tu TVF',
  },
};

export const TripCancelledScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const clearTrip = useTripStore((s) => s.clearTrip);

  const params = useLocalSearchParams<{
    cancel_reason?: string;
    credit_driver?: string;
  }>();

  const reason = params.cancel_reason ?? 'user_cancel';
  const copy = COPY[reason] ?? COPY.user_cancel;
  const creditDriver = params.credit_driver === 'true';

  const extra =
    reason === 'user_cancel' && creditDriver
      ? 'Lifty te transferirá $600.'
      : reason === 'no_show'
        ? 'Has recibido $600 por concepto de cancelación. Lifty te transferirá $600.'
        : null;

  const goHome = () => {
    clearTrip();
    navigation.replace('Online');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Ionicons name="information-circle-outline" size={64} color={theme.colors.turquoise} />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.tvf}>{copy.tvf}</Text>
        {extra ? <Text style={styles.extra}>{extra}</Text> : null}
        <Button title="VOLVER A INICIO" variant="cta" onPress={goHome} style={styles.button} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  tvf: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  extra: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  button: {
    marginTop: theme.spacing.md,
  },
});
