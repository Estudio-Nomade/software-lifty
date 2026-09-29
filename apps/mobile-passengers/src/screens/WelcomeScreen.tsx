import { Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

/** Teal L monogram (portrait mark). Wordmark + tagline are text below. */
const MARK_L = require('../../assets/lifty-mark-l.png');

export function WelcomeScreen() {
  const { navigate } = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      <View style={styles.main}>
        <View style={styles.brand}>
          <Image source={MARK_L} style={styles.mark} resizeMode="contain" />
          <Text style={styles.wordmark}>Lifty</Text>
          <Text style={styles.tagline}>Movilidad que te eleva</Text>
        </View>
        <View style={styles.actions}>
          <Button variant="cta" onPress={() => navigate('Register')}>
            Crear cuenta
          </Button>
          <Button variant="secondary" onPress={() => navigate('LoginCredentials')}>
            Iniciar sesión
          </Button>
          <Text style={styles.terms}>Al continuar aceptás los Términos y Condiciones</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing['2xl'],
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  brand: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  mark: {
    width: 148,
    height: 182,
    marginBottom: theme.spacing.xs,
  },
  wordmark: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    maxWidth: 280,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.sm,
    alignItems: 'stretch',
    marginTop: theme.spacing.lg,
  },
  terms: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 16,
  },
});
