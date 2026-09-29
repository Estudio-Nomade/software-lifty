import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLogin } from '../hooks/useAuth';
import { getFriendlyAuthError } from '../lib/authErrors';
import {
  isTransientStatusFailure,
  resolvePostAuthRoute,
  routeForDriverStatus,
} from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

type Step = 'credentials' | 'otp';

const COOLDOWN_SECONDS = 30;

export const LoginCredentialsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('credentials');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);

  const login = useLogin();
  const { sendEmailOtp, verifyEmailOtp, resendEmailOtp, signInWithGoogle, signOut } = useAuth();

  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const termsAccepted = useAuthStore((s) => s.termsAccepted);

  useEffect(() => {
    if (emailParam && !username) {
      setUsername(emailParam);
    }
  }, [emailParam, username]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const finishAuth = useCallback(async () => {
    try {
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }

      if (termsAccepted) {
        if (route.screen) {
          navigation.navigate(route.screen);
        }
      } else {
        navigation.navigate('Terms');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos hablar con el servidor de Lifty. Revisá conexión.';
      setError(message);
      if (isTransientStatusFailure(err)) {
        try {
          await signOut();
        } catch {
          useAuthStore.getState().clearAuthState();
        }
      }
    }
  }, [navigation, termsAccepted, signOut]);

  const handleGoogle = useCallback(async () => {
    if (googleLoading) return;
    setError(null);
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      if (!session) return;
      await finishAuth();
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLoading, signInWithGoogle, finishAuth]);

  const handleLogin = async () => {
    setError(null);
    try {
      const result = await login.mutateAsync({ email: username.trim(), password });
      if (result.access_token) {
        useAuthStore.getState().setSession(result.access_token, result.user?.id ?? null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesion';
      setError(message);
      return;
    }

    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = parsed.success ? parsed.data : (payload as DriverStatus);

      const route = routeForDriverStatus(driverData);
      setDriverStatus(route.status);
      if (driverData.step != null) {
        useAuthStore.getState().setOnboardingStep(driverData.step);
      }

      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }

      if (termsAccepted) {
        if (route.screen) {
          navigation.navigate(route.screen);
        }
      } else {
        navigation.navigate('Terms');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos hablar con el servidor de Lifty. Revisá conexión.';
      setError(message);
      // Auth OK + status fail must not leave store in limbo (welcome spinner / fake onboarding).
      if (isTransientStatusFailure(err)) {
        try {
          await signOut();
        } catch {
          useAuthStore.getState().clearAuthState();
        }
      }
    }
  };

  const handleSendOtp = async () => {
    const email = username.trim();
    if (!email) {
      setError('Ingresa tu email');
      return;
    }
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      await sendEmailOtp(email);
      setStep('otp');
      setOtp('');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || sending) return;
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      await resendEmailOtp(username.trim());
      setInfo('Te enviamos un nuevo codigo');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6 || verifying) return;
    setError(null);
    setInfo(null);
    setVerifying(true);
    try {
      const session = await verifyEmailOtp(username.trim(), otp);
      if (!session) {
        setError('El codigo es invalido o expiro. Pedi uno nuevo.');
        return;
      }
      useAuthStore.getState().setSession(session.access_token, session.user?.id ?? null);
      await finishAuth();
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setVerifying(false);
    }
  };

  const isDisabled = !username || !password || login.isPending;

  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setStep('credentials');
              setError(null);
              setInfo(null);
            }}
          >
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.otpContent}>
          <Text style={styles.title}>Ingresá el código</Text>
          <Text style={styles.subtitle}>Te enviamos un código a {username.trim()}</Text>
          <OTPInput length={6} value={otp} onChange={setOtp} />
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || sending}>
            <Text style={[styles.resend, (cooldown > 0 || sending) && styles.resendDisabled]}>
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : '¿No te llegó? Reenviar'}
            </Text>
          </TouchableOpacity>
          {info !== null && <Text style={styles.infoText}>{info}</Text>}
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          <Button
            title="Verificar código"
            onPress={handleVerifyOtp}
            loading={verifying}
            disabled={otp.length !== 6 || verifying}
            style={styles.button}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.form}>
          <Text style={styles.title}>Iniciar sesión</Text>
          <Text style={styles.subtitle}>Ingresá tu email y contraseña</Text>

          <Input
            placeholder="Email"
            value={username}
            onChangeText={setUsername}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.inputField}
          />
          <Input
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            containerStyle={styles.inputField}
            rightElement={
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.mediumGray}
                />
              </TouchableOpacity>
            }
          />

          <Button
            title="Iniciar sesión"
            onPress={handleLogin}
            loading={login.isPending}
            disabled={isDisabled}
            style={styles.button}
          />
          <Button
            title={googleLoading ? '' : 'Continuar con Google'}
            onPress={handleGoogle}
            loading={googleLoading}
            style={[styles.button, styles.googleButton]}
            textStyle={styles.googleButtonText}
          />
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.forgotPassword}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSendOtp}>
            <Text style={styles.otpLink}>
              {sending ? 'Enviando código...' : 'Iniciar sesión sin contraseña'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: theme.dimensions.navbarHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  backText: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  inputField: {
    width: '100%',
  },
  button: {
    width: '100%',
  },
  googleButton: {
    backgroundColor: theme.colors.deepBlue,
  },
  googleButtonText: {
    color: theme.colors.white,
    fontSize: 16,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    width: '100%',
    textAlign: 'center',
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  otpContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  resend: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  resendDisabled: {
    color: theme.colors.mediumGray,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    textAlign: 'center',
    width: '100%',
  },
  otpLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
});
