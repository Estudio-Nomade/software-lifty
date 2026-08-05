import { theme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function LoginPhoneScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ingresa tu celular</Text>
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
  },
});
