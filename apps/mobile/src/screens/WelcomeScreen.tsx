import type React from 'react';
import { useCallback, useState } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';
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

export const WelcomeScreen: React.FC = () => {
  const navigation = useAppNavigation();
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
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
        <LoadingOverlay visible />
      </View>
    );
  }

  if (mode === 'handoff') {
    return null;
  }

  if (mode === 'recovery') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.wordmark}>Lifty</Text>
        <Text style={styles.recoveryTitle}>No pudimos cargar tu cuenta</Text>
        <Text style={styles.recoveryBody}>
          Hay sesión, pero el servidor no respondió. Reintentá o cerrá sesión para volver al inicio.
        </Text>
        {recoveryError !== null && <Text style={styles.recoveryError}>{recoveryError}</Text>}
        <Button
          title="REINTENTAR"
          onPress={handleRetryStatus}
          loading={retrying}
          disabled={retrying || signingOut}
          style={styles.button}
          textStyle={styles.buttonText}
        />
        <Button
          title="CERRAR SESION"
          onPress={handleSignOut}
          loading={signingOut}
          disabled={retrying || signingOut}
          variant="outline"
          outlineColor={theme.colors.white}
          style={styles.button}
          textStyle={styles.buttonText}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
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
  logo: {
    width: 120,
    height: 142,
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
  recoveryTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  recoveryBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    maxWidth: 327,
  },
  recoveryError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    maxWidth: 327,
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
