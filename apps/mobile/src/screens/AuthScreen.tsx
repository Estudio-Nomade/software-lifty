import { useRouter } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getFriendlyAuthError } from '../lib/authErrors';
import { isTransientStatusFailure, resolvePostAuthRoute } from '../lib/postAuthRouting';
import {
  afterPostOAuthHandoff,
  beginOAuthBrandBridge,
  endOAuthBrandBridge,
  resetPostOAuthHandoff,
  runPostOAuthHandoff,
} from '../lib/postOAuthHandoff';
import { routePathForScreen } from '../lib/screenRoutes';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

type Step = 'method' | 'email' | 'otp';

const COOLDOWN_SECONDS = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const router = useRouter();
  const { signInWithGoogle, sendEmailOtp, verifyEmailOtp, resendEmailOtp, signOut } = useAuth();

  const [step, setStep] = useState<Step>('method');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Shared post-authentication handoff: create/read the profile and route the
  // user to onboarding (new) or straight into the app (existing).
  const finishAuth = useCallback(async () => {
    try {
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
      if (isTransientStatusFailure(err)) {
        try {
          await signOut();
        } catch {
          useAuthStore.getState().clearAuthState();
        }
      }
    }
  }, [navigation, signOut]);

  /** Google twin-path: single-flight replace (shared with AuthCallback). Paths only. */
  const finishGoogleAuth = useCallback(
    async (userId: string) => {
      const navigatePath = (path: string) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[oauth-handoff] replace →', path, 'owner=AuthScreen');
        }
        router.replace(path);
      };
      try {
        const result = await runPostOAuthHandoff({
          key: userId,
          owner: 'AuthScreen',
          resolveTarget: async () => {
            const route = await resolvePostAuthRoute();
            if (route.blockedMessage) {
              throw new Error(route.blockedMessage);
            }
            if (!route.screen) {
              throw new Error('No se pudo determinar el siguiente paso.');
            }
            return routePathForScreen(route.screen);
          },
          navigate: navigatePath,
        });
        afterPostOAuthHandoff(result, navigatePath);
      } catch (err) {
        endOAuthBrandBridge();
        setError(getFriendlyAuthError(err));
        if (isTransientStatusFailure(err)) {
          try {
            await signOut();
          } catch {
            useAuthStore.getState().clearAuthState();
          }
        }
      }
    },
    [router, signOut],
  );

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError(null);
    setGoogleLoading(true);
    resetPostOAuthHandoff();
    try {
      const session = await signInWithGoogle();
      if (!session?.user) {
        // User dismissed the browser — no error, just stop.
        endOAuthBrandBridge();
        return;
      }
      beginOAuthBrandBridge();
      useAuthStore.getState().setSession(session.access_token, session.user.id);
      await finishGoogleAuth(session.user.id);
    } catch (err) {
      endOAuthBrandBridge();
      setError(getFriendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSendCode = async () => {
    const value = email.trim();
    if (!EMAIL_REGEX.test(value)) {
      setError('Ingresa un email valido.');
      return;
    }
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      await sendEmailOtp(value);
      setStep('otp');
      setOtp('');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      console.error('[AuthScreen] sendEmailOtp error:', err);
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
      await resendEmailOtp(email.trim());
      setInfo('Te enviamos un nuevo codigo.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6 || verifying) return;
    setError(null);
    setInfo(null);
    setVerifying(true);
    try {
      const session = await verifyEmailOtp(email.trim(), otp);
      if (!session) {
        setError('El codigo es invalido o expiro. Pedi uno nuevo.');
        return;
      }
      await finishAuth();
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setVerifying(false);
    }
  };

  const goToMethod = () => {
    setStep('method');
    setError(null);
    setInfo(null);
  };

  const goToEmailEntry = () => {
    setStep('email');
    setOtp('');
    setError(null);
    setInfo(null);
  };

  const formBody = (
    <View style={styles.content}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.wordmark}>Lifty</Text>

      {step === 'method' && (
        <>
          <Text style={styles.tagline}>Conduci, gana en serio</Text>
          <View style={styles.spacer} />
          <Button
            title={googleLoading ? '' : 'CONTINUAR CON GOOGLE'}
            onPress={handleGoogle}
            loading={googleLoading}
            style={[styles.button, styles.googleButton]}
            textStyle={styles.googleButtonText}
          />
          <Button
            title="CONTINUAR CON EMAIL"
            variant="secondary"
            onPress={goToEmailEntry}
            style={[styles.button, styles.emailButton]}
            textStyle={styles.emailButtonText}
          />
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.spacerSmall} />
          <Text style={styles.terms}>Al continuar aceptas los Terminos y Condiciones</Text>
        </>
      )}

      {step === 'email' && (
        <>
          <Text style={styles.title}>Ingresa tu email</Text>
          <Text style={styles.subtitle}>Te enviaremos un codigo de un solo uso.</Text>
          <View style={styles.spacer} />
          <Input
            placeholder="tu@email.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!sending}
            containerStyle={styles.inputField}
          />
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.spacerSmall} />
          <Button
            title="ENVIAR CODIGO"
            onPress={handleSendCode}
            loading={sending}
            disabled={!email.trim() || sending}
            style={styles.button}
          />
          <TouchableOpacity onPress={goToMethod} style={styles.linkRow}>
            <Text style={styles.link}>Volver</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'otp' && (
        <>
          <Text style={styles.title}>Ingresa el codigo</Text>
          <Text style={styles.subtitle}>Te enviamos un codigo a {email.trim()}</Text>
          <View style={styles.spacer} />
          <OTPInput length={6} value={otp} onChange={setOtp} />
          <View style={styles.spacer} />
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || sending}>
            <Text style={[styles.resend, (cooldown > 0 || sending) && styles.resendDisabled]}>
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'No te llego? Reenviar'}
            </Text>
          </TouchableOpacity>
          {info !== null && <Text style={styles.info}>{info}</Text>}
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.spacerSmall} />
          <Button
            title="VERIFICAR CODIGO"
            onPress={handleVerify}
            loading={verifying}
            disabled={otp.length !== 6 || verifying}
            style={styles.button}
          />
          <TouchableOpacity onPress={goToEmailEntry} style={styles.linkRow}>
            <Text style={styles.link}>Usar otro email</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/*
        Android: no KeyboardAvoidingView — SO already resizes; KAV leaves a gray gap.
        iOS: padding KAV + ScrollView.
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {formBody}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {formBody}
        </ScrollView>
      )}
      {googleLoading && step === 'method' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={theme.colors.turquoise} size="large" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
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
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  spacer: {
    height: theme.spacing.md,
  },
  spacerSmall: {
    height: theme.spacing.xs,
  },
  button: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  googleButton: {
    backgroundColor: theme.colors.surface,
  },
  googleButtonText: {
    color: theme.colors.deepBlue,
    fontSize: 16,
  },
  emailButton: {
    borderColor: theme.colors.white,
  },
  emailButtonText: {
    color: theme.colors.white,
    fontSize: 16,
  },
  inputField: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
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
  info: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  linkRow: {
    paddingVertical: theme.spacing.sm,
  },
  link: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  terms: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 43, 69, 0.5)',
  },
});
