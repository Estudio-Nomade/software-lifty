import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

export const PassengerCodeScreen: React.FC = () => {
  const trip = useTripStore((s) => s.trip);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Tu código de verificación</Text>
      <View style={styles.codeBox}>
        <Text style={styles.code}>{trip?.verification_code ?? '----'}</Text>
      </View>
      <Text style={styles.hint}>Mostrale este código a tu conductor</Text>
      {trip?.passenger_name ? (
        <Text style={styles.driver}>Conductor: {trip.passenger_name}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
  },
  label: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  codeBox: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.lg,
  },
  code: {
    fontSize: theme.fontSize['5xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: 8,
  },
  hint: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  driver: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
});
