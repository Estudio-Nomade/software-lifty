import { theme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lifty</Text>
      <Text style={styles.subtitle}>Tu viaje, a un toque</Text>
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
  },
  title: {
    ...theme.fontStyles.heading,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.fontStyles.subheading,
    color: theme.colors.mediumGray,
  },
});
