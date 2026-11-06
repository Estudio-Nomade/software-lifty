import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLoginHint } from '../api/loginHint';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { LoadingOverlay } from '../components/feedback/LoadingOverlay';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useResendCode, useSignUp, useVerifyEmail } from '../hooks/useAuth';
import {
  EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE,
  GOOGLE_ONLY_LOGIN_MESSAGE,
  getFriendlyAuthError,
} from '../lib/authErrors';
import {
  isTransientStatusFailure,
  resolvePostAuthRoute,
  resolvePostGoogleOAuthPath,
} from '../lib/postAuthRouting';
import {
  afterPostOAuthHandoff,
  beginOAuthBrandBridge,
  endOAuthBrandBridge,
  resetPostOAuthHandoff,
  runPostOAuthHandoff,
} from '../lib/postOAuthHandoff';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

async function clearSessionAfterStatusFail(
  err: unknown,
  signOutFn: () => Promise<void>,
): Promise<void> {
  if (!isTransientStatusFailure(err)) return;
  try {
    await signOutFn();
  } catch {
    useAuthStore.getState().clearAuthState();
  }
}

export const RegisterScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);
  const { loading, signInWithGoogle, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [verificationCode, setVerificationCode] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [highlightGoogle, setHighlightGoogle] = useState(false);

  const signUp = useSignUp();
  const verifyEmail = useVerifyEmail();
  const resendCode = useResendCode();

  const handleGoogle = useCallback(async () => {
    if (googleLoading) return;
    setError(null);
    setHighlightGoogle(false);
    setGoogleLoading(true);
    resetPostOAuthHandoff();
    try {
      const session = await signInWithGoogle();
      if (!session?.user) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[oauth] handleGoogle session? null owner=Register');
        }
        endOAuthBrandBridge();
        return;
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[oauth] handleGoogle session?', {
          hasUser: true,
          email: session.user.email ?? null,
          owner: 'Register',
        });
      }
      beginOAuthBrandBridge();
      useAuthStore.getState().setSession(session.access_token, session.user.id);
      const navigatePath = (path: string) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[oauth-handoff] replace →', path, 'owner=Register');
        }
        router.replace(path);
      };
      const result = await runPostOAuthHandoff({
        key: session.user.id,
        owner: 'Register',
        resolveTarget: () => resolvePostGoogleOAuthPath(),
        navigate: navigatePath,
      });
      afterPostOAuthHandoff(result, navigatePath);
    } catch (err) {
      endOAuthBrandBridge();
      setError(getFriendlyAuthError(err));
      await clearSessionAfterStatusFail(err, signOut);
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLoading, signInWithGoogle, router, signOut]);

  const passwordMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  const handleRegister = async () => {
    setError(null);
    setInfo(null);
    setHighlightGoogle(false);
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      // Same Supabase project as the passenger app. If the email already exists
      // (e.g. they signed up as passenger first), signUp returns success with
      // empty identities and does NOT send a confirmation email (anti-enumeration).
      const data = await signUp.mutateAsync({ email: email.trim(), password });

      if (data.session) {
        // Email confirmation disabled — already authenticated; continue onboarding.
        try {
          const route = await resolvePostAuthRoute();
          if (route.blockedMessage) {
            setError(route.blockedMessage);
            return;
          }
          if (route.screen) {
            navigation.replace(route.screen);
          }
        } catch (statusErr: unknown) {
          setError(getFriendlyAuthError(statusErr));
          await clearSessionAfterStatusFail(statusErr, signOut);
        }
        return;
      }

      if ((data.user?.identities?.length ?? 0) > 0) {
        setStep('verify');
        return;
      }

      // Existing Lifty account (passenger or driver) — no mail is sent.
      // Hint distinguishes Google-only (no password to reuse) from dual-role with password.
      const hint = await fetchLoginHint(email.trim()).catch(() => null);
      if (hint?.googleOnly) {
        setError(GOOGLE_ONLY_LOGIN_MESSAGE);
        setHighlightGoogle(true);
        return;
      }
      setError(EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE);
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err));
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setInfo(null);
    try {
      await resendCode.mutateAsync({ email: email.trim() });
      setInfo('Te enviamos un nuevo codigo');
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err));
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) return;
    setError(null);
    setInfo(null);

    try {
      await verifyEmail.mutateAsync({ email: email.trim(), code: verificationCode });
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      if (route.status) {
        setDriverStatus(route.status);
      }
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err));
      await clearSessionAfterStatusFail(err, signOut);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay visible />
      </View>
    );
  }

  if (step === 'verify') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + theme.spacing.sm,
              paddingBottom: theme.spacing.sm,
              minHeight: theme.dimensions.navbarHeight + insets.top,
            },
          ]}
        >
          <TouchableOpacity
            hitSlop={8}
            onPress={() => {
              setStep('form');
              setError(null);
            }}
            style={styles.backButton}
          >
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.verifyContent}>
          <Text style={styles.title}>Verificá tu email</Text>
          <Text style={styles.subtitle}>
            Te enviamos un código de 6 dígitos a {email}. Si no lo ves, revisá spam.
          </Text>
          <OTPInput length={6} value={verificationCode} onChange={setVerificationCode} />
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          {info !== null && <Text style={styles.infoText}>{info}</Text>}
          <Button
            title={
              verificationCode.length === 6 && !verifyEmail.isPending
                ? 'Verificar código'
                : 'Iniciar sesión'
            }
            onPress={
              verificationCode.length === 6
                ? handleVerify
                : () => navigation.replace('LoginCredentials')
            }
            loading={verifyEmail.isPending}
            disabled={verificationCode.length !== 6 && verificationCode.length > 0}
            style={styles.button}
          />
          <TouchableOpacity onPress={handleResendCode} disabled={resendCode.isPending}>
            <Text style={styles.resendLink}>Reenviar código</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const formBody = (
    <View style={styles.form}>
      <Text style={styles.title}>Crear cuenta</Text>
      <Text style={styles.subtitle}>Ingresá tu email y contraseña para registrarte</Text>
      <Input
        placeholder="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setError(null);
          if (highlightGoogle) setHighlightGoogle(false);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        containerStyle={styles.inputField}
      />
      <Input
        placeholder="Contraseña"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setError(null);
        }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        containerStyle={styles.inputField}
      />
      <Input
        placeholder="Confirmar contraseña"
        value={confirmPassword}
        onChangeText={(t) => {
          setConfirmPassword(t);
          setError(null);
        }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        containerStyle={styles.inputField}
      />
      <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
        <View style={styles.showPasswordRow}>
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={theme.colors.mediumGray}
          />
          <Text style={styles.showPasswordText}>
            {showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          </Text>
        </View>
      </TouchableOpacity>
      {passwordMismatch && <Text style={styles.mismatchText}>Las contraseñas no coinciden</Text>}
      {passwordMatch && <Text style={styles.matchText}>✓ Las contraseñas coinciden</Text>}
      <Button
        title="Crear cuenta"
        onPress={handleRegister}
        loading={signUp.isPending}
        disabled={!email.trim() || !password || !confirmPassword || signUp.isPending}
        style={styles.button}
      />
      <Button
        title={googleLoading ? '' : 'Continuar con Google'}
        onPress={handleGoogle}
        loading={googleLoading}
        style={[
          styles.button,
          styles.googleButton,
          highlightGoogle ? styles.googleHighlight : null,
        ]}
        textStyle={styles.googleButtonText}
      />
      {error !== null && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity
        onPress={() => {
          const trimmed = email.trim();
          if (trimmed) {
            navigation.navigate('LoginCredentials', { email: trimmed });
          } else {
            navigation.navigate('LoginCredentials');
          }
        }}
      >
        <Text style={styles.loginLink}>¿Ya tenés cuenta? Iniciá sesión</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            minHeight: theme.dimensions.navbarHeight + insets.top,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>
      {/*
        Android: no KeyboardAvoidingView — SO already resizes; KAV leaves a gray gap.
        iOS: padding KAV + ScrollView.
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
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
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {formBody}
        </ScrollView>
      )}
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
  },
  flex: {
    flex: 1,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  backText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  verifyContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  inputField: {
    width: '100%',
    marginBottom: theme.spacing.xs,
  },
  showPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: theme.spacing.xs,
  },
  showPasswordText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  mismatchText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  matchText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  button: {
    marginTop: theme.spacing.xs,
    width: '100%',
  },
  googleButton: {
    backgroundColor: theme.colors.deepBlue,
  },
  googleHighlight: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  googleButtonText: {
    color: theme.colors.white,
    fontSize: 16,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  resendLink: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  loginLink: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
});
