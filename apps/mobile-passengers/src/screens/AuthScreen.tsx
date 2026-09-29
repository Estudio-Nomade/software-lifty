import { theme } from '@/theme';
import { Image, StyleSheet, Text, View } from 'react-native';

const MARK_L = require('../../assets/lifty-mark-l.png');

export function AuthScreen() {
  return (
    <View style={styles.container}>
      <Image source={MARK_L} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Iniciar sesión</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  logo: {
    width: 96,
    height: 118,
  },
  title: {
    ...theme.fontStyles.heading,
    fontFamily: theme.fontFamily.bold,
  },
});
