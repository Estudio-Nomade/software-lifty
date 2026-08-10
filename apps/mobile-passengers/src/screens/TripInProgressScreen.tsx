import { SponsorBanner } from '@/components/SponsorBanner';
import { theme } from '@/theme';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function TripInProgressScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <View style={styles.content}>
        <Text style={styles.title}>Tu conductor viene en camino</Text>
        <Text style={styles.subtitle}>Espera en el punto de recogida</Text>
      </View>
      <SponsorBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  title: {
    ...theme.fontStyles.heading,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
});
