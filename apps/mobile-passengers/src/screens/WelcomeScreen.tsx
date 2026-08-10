import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export function WelcomeScreen() {
  const { navigate } = useAppNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>L</Text>
        </View>
        <Text style={styles.brand}>Lifty</Text>
        <Text style={styles.tagline}>
          <Text style={styles.taglineWhite}>Movilidad que </Text>
          <Text style={styles.taglineAccent}>te eleva.</Text>
        </Text>
      </View>

      <View style={styles.actions}>
        <Button variant="primary" onPress={() => navigate('LoginPhone')}>
          📱 Ingresar con celular
        </Button>
        <Button variant="secondary" onPress={() => navigate('Register')}>
          Crear cuenta
        </Button>
        <Text style={styles.soonTag}>📧 Ingresar con email — próximamente</Text>
        <Text style={styles.termsLink} onPress={() => navigate('Terms')}>
          Términos y condiciones
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
    padding: theme.spacing.lg,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  logoMark: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 64,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    lineHeight: 70,
  },
  brand: {
    fontSize: 48,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  tagline: {
    fontSize: theme.fontSize.md,
  },
  taglineWhite: {
    color: theme.colors.white,
    fontFamily: theme.fontFamily.regular,
  },
  taglineAccent: {
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  termsLink: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    fontFamily: theme.fontFamily.regular,
  },
  soonTag: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.sm,
  },
});
