import { theme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¿A dónde vas?</Text>
      <Text style={styles.subtitle}>Solicita un viaje</Text>
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
