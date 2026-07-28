import type React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { LoadingOverlay } from '../components/feedback/LoadingOverlay';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const WelcomeScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { loading } = useAuth();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
        <LoadingOverlay visible />
      </View>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={styles.logoCircle}>
        <View style={styles.logoInner}>
          <Text style={styles.logoLetter}>L</Text>
        </View>
      </View>
      <Text style={styles.wordmark}>Lifty</Text>
      <Text style={styles.tagline}>Conduci, gana en serio</Text>
      <Button
        title="CREAR CUENTA"
        onPress={() => navigation.navigate('Register')}
        style={styles.button}
        textStyle={styles.buttonText}
      />
      <Button
        title="INICIAR SESION"
        onPress={() => navigation.navigate('LoginCredentials')}
        style={styles.button}
        textStyle={styles.buttonText}
      />
      <View style={styles.spacerSmall} />
      <Text style={styles.terms}>Al continuar aceptas los Terminos y Condiciones</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  wordmark: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  button: {
    width: 327,
    height: 52,
  },
  buttonText: {
    fontSize: 18,
  },
  spacerSmall: {
    height: 8,
  },
  terms: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
});
