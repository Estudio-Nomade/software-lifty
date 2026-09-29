import type React from 'react';
import { useCallback, useState } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { LoadingOverlay } from '../components/feedback/LoadingOverlay';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { welcomeEntryMode } from '../lib/driverStatusGate';
import { routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

/** Teal L monogram (portrait mark). Wordmark + tagline are text below. */
const MARK_L = require('../../assets/lifty-mark-l.png');

export const WelcomeScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const { loading, signOut } = useAuth();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const mode = welcomeEntryMode({
    authLoading: loading,
    sessionRestored,
    isAuthenticated,
    driverStatus,
    onboardingStep,
  });

  const handleRetryStatus = useCallback(async () => {
    if (retrying) return;
    setRecoveryError(null);
    setRetrying(true);
    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = parsed.success ? parsed.data : (payload as DriverStatus);
      const route = routeForDriverStatus(driverData);
      if (driverData.status) {
        useAuthStore.getState().setDriverStatus(driverData.status);
      }
      if (driverData.step != null) {
        useAuthStore.getState().setOnboardingStep(driverData.step);
      } else if (route.status) {
        useAuthStore.getState().setDriverStatus(route.status);
      }
      if (route.blockedMessage) {
        setRecoveryError(route.blockedMessage);
        return;
      }
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos hablar con el servidor de Lifty. Revisá conexión.';
      setRecoveryError(message);
    } finally {
      setRetrying(false);
    }
  }, [navigation, retrying]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setRecoveryError(null);
    try {
      await signOut();
    } catch {
      useAuthStore.getState().clearAuthState();
    } finally {
      setSigningOut(false);
    }
  }, [signOut, signingOut]);

  if (mode === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
        <LoadingOverlay visible />
      </View>
    );
  }

  if (mode === 'handoff') {
    return null;
  }

  if (mode === 'recovery') {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
        <View style={styles.hero}>
          <Image source={MARK_L} style={styles.mark} resizeMode="contain" />
          <Text style={styles.recoveryTitle}>No pudimos cargar tu cuenta</Text>
          <Text style={styles.recoveryBody}>
            Hay sesión, pero el servidor no respondió. Reintentá o cerrá sesión para volver al
            inicio.
          </Text>
          {recoveryError !== null && <Text style={styles.recoveryError}>{recoveryError}</Text>}
        </View>
        <View style={styles.actions}>
          <Button
            title="Reintentar"
            onPress={handleRetryStatus}
            loading={retrying}
            disabled={retrying || signingOut}
          />
          <Button
            title="Cerrar sesión"
            onPress={handleSignOut}
            loading={signingOut}
            disabled={retrying || signingOut}
            variant="secondary"
          />
        </View>
      </View>
    );
  }

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
          <Button
            title="Crear cuenta"
            onPress={() => navigation.navigate('Register')}
            variant="cta"
          />
          <Button
            title="Iniciar sesión"
            onPress={() => navigation.navigate('LoginCredentials')}
            variant="secondary"
          />
          <Text style={styles.terms}>Al continuar aceptás los Términos y Condiciones</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
  },
  /** L monogram + wordmark mid; CTAs a bit lower. */
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
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  /** Portrait teal L (~139×171). */
  mark: {
    width: 148,
    height: 182,
    marginBottom: theme.spacing.xs,
  },
  wordmark: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    maxWidth: 280,
  },
  recoveryTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  recoveryBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  recoveryError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.sm,
    alignItems: 'stretch',
    marginTop: theme.spacing.lg,
  },
  terms: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 16,
  },
});
