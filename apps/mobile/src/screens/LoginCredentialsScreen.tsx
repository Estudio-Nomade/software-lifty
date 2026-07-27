import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLogin } from '../hooks/useAuth';
import { getFriendlyAuthError } from '../lib/authErrors';
import { resolvePostAuthRoute } from '../lib/postAuthRouting';
import { routeForDriverStatus } from '../lib/postAuthRouting';
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
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);

  const login = useLogin();
  const { sendEmailOtp, verifyEmailOtp, resendEmailOtp } = useAuth();

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
  }, [navigation, termsAccepted]);

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
        err instanceof Error ? err.message : 'No se pudo verificar el estado de tu cuenta';
      setError(message);
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
          <Text style={styles.title}>Ingresa el codigo</Text>
          <Text style={styles.subtitle}>Te enviamos un codigo a {username.trim()}</Text>
          <View style={{ height: 24 }} />
          <OTPInput length={6} value={otp} onChange={setOtp} />
          <View style={{ height: 16 }} />
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || sending}>
            <Text style={[styles.resend, (cooldown > 0 || sending) && styles.resendDisabled]}>
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'No te llego? Reenviar'}
            </Text>
          </TouchableOpacity>
          {info !== null && <Text style={styles.infoText}>{info}</Text>}
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          <View style={{ height: 8 }} />
          <Button
            title="VERIFICAR CODIGO"
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
        <View style={styles.spacerTop} />
        <Text style={styles.title}>Iniciar sesion</Text>
        <View style={styles.gapMd} />
        <Text style={styles.subtitle}>Ingresa tu email y contrasena</Text>
        <View style={styles.spacer} />

        <Input
          placeholder="Email"
          value={username}
          onChangeText={setUsername}
          keyboardType="email-address"
          autoCapitalize="none"
          containerStyle={styles.inputField}
        />
        <View style={styles.gapMd} />
        <Input
          placeholder="Contrasena"
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
        <View style={styles.spacer} />

        <Button
          title="INICIAR SESION"
          onPress={handleLogin}
          loading={login.isPending}
          disabled={isDisabled}
          style={styles.button}
        />
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.gapMd} />
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotPassword}>Olvidaste tu contrasena?</Text>
        </TouchableOpacity>
        <View style={styles.gapMd} />
        <TouchableOpacity onPress={handleSendOtp}>
          <Text style={styles.otpLink}>
            {sending ? 'Enviando codigo...' : 'Iniciar sesion sin contrasena'}
          </Text>
        </TouchableOpacity>

        <View style={styles.filler} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
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
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  spacerTop: {
    height: 16,
  },
  gapMd: {
    height: theme.spacing.md,
  },
  spacer: {
    height: 8,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    width: 327,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    width: 327,
  },
  inputField: {
    width: 327,
  },
  eyeIcon: {
    fontSize: theme.fontSize.md,
  },
  button: {
    width: 327,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    width: 327,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  otpContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    alignItems: 'center',
  },
  resend: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  resendDisabled: {
    color: theme.colors.mediumGray,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    width: 327,
  },
  otpLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  filler: {
    flex: 1,
  },
});
