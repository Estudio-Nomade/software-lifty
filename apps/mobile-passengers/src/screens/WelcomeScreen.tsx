import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const logoImg = require('../../assets/logo.png');

export function WelcomeScreen() {
  const { navigate } = useAppNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={logoImg} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Lifty</Text>
        <Text style={styles.tagline}>Movilidad que te eleva.</Text>
        <View style={styles.spacer} />
        <Button variant="primary" onPress={() => navigate('Register')} style={styles.button}>
          CREAR CUENTA
        </Button>
        <Button
          variant="secondary"
          onPress={() => navigate('LoginCredentials')}
          style={styles.button}
        >
          INICIAR SESIÓN
        </Button>
        <View style={styles.spacerSmall} />
        <Text style={styles.terms}>Al continuar aceptas los Términos y Condiciones</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  logo: {
    width: 120,
    height: 142,
  },
  brand: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
  spacer: {
    height: theme.spacing.md,
  },
  spacerSmall: {
    height: theme.spacing.xs,
  },
  button: {
    width: 327,
  },
  terms: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
});
