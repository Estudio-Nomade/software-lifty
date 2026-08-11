import { theme } from '@/theme';
import { Image, StyleSheet, Text, View } from 'react-native';

const logoImg = require('../../assets/logo.png');

export function AuthScreen() {
  return (
    <View style={styles.container}>
      <Image source={logoImg} style={styles.logo} />
      <Text style={styles.title}>Iniciar sesión</Text>
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
  logo: {
    width: 96,
    height: 96,
    borderRadius: 16,
    resizeMode: 'contain',
  },
  title: {
    ...theme.fontStyles.heading,
  },
});
