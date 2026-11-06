import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLoginHint, registerPassenger } from '../api/passenger';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  GOOGLE_ONLY_LOGIN_MESSAGE,
  getFriendlyAuthError,
  isInvalidLoginCredentialsError,
} from '../lib/authErrors';
import {
  resolvePassengerPostAuthPath,
  resolvePassengerPostAuthPathWithRetry,
} from '../lib/postAuthRouting';
import {
  afterPostOAuthHandoff,
  beginOAuthBrandBridge,
  endOAuthBrandBridge,
  endOAuthBrandBridgeAfterPaint,
  getLastOAuthHandoffTarget,
  resetPostOAuthHandoff,
  runPostOAuthHandoff,
} from '../lib/postOAuthHandoff';
import { classifySignUpResult } from '../lib/signupEmail';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useRegistrationDraftStore } from '../store/registrationDraftStore';
import { theme } from '../theme';

function replacePathAfterAuth(
  replace: ReturnType<typeof useAppNavigation>['replace'],
  path: string,
  userId: string | null | undefined,
) {
  if (path === '/complete-profile') {
    replace('CompleteProfile');
    return;
  }
  if (path === '/location-permissions') {
    replace('LocationPermissions');
    return;
  }
  if (path === '/home') {
    replace('Home');
    return;
  }
  // Never bounce authed users to guest Welcome (OAuth / password success).
  if (userId) {
    replace('CompleteProfile');
    return;
  }
  replace('Welcome');
}

async function replaceAfterAuth(
  replace: ReturnType<typeof useAppNavigation>['replace'],
  userId: string | null | undefined,
) {
  const path = await resolvePassengerPostAuthPath(userId ?? null);
  replacePathAfterAuth(replace, path, userId);
}

/** Google twin-path: share module lock with AuthCallback — one replace max. */
async function replaceAfterGoogleAuth(
  replace: ReturnType<typeof useAppNavigation>['replace'],
  userId: string,
  owner: string,
) {
  const result = await runPostOAuthHandoff({
    key: userId,
    owner,
    resolveTarget: async () => {
      // Retry profile gate like AuthCallback so established accounts reach /home.
      let path = await resolvePassengerPostAuthPathWithRetry(userId);
      if (path === '/' && userId) path = '/complete-profile';
      if (path === '/') return '/login-credentials';
      return path;
    },
    navigate: (path) => replacePathAfterAuth(replace, path, userId),
  });
  afterPostOAuthHandoff(result, (target) => replacePathAfterAuth(replace, target, userId));
}

export function LoginCredentialsScreen() {
  const { goBack, navigate, replace } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle } = useAuth();
  const fullName = useRegistrationDraftStore((s) => s.fullName);
  const clearDraft = useRegistrationDraftStore((s) => s.clear);
  const isSignUp = (fullName?.length ?? 0) > 0;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightGoogle, setHighlightGoogle] = useState(false);

  const isDisabled =
    !email ||
    !password ||
    loading ||
    (isSignUp && (!confirmPassword || password !== confirmPassword));

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    setHighlightGoogle(false);
    setLoading(true);
    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden.');
          setLoading(false);
          return;
        }
        const phoneTrimmed = phone.trim() || undefined;
        const trimmedEmail = email.trim();
        const { data, error: err } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { full_name: fullName, phone: phoneTrimmed },
          },
        });
        if (__DEV__) {
          console.log('[signUp]', {
            hasSession: Boolean(data.session),
            identities: data.user?.identities?.length ?? 0,
            confirmation_sent_at: data.user?.confirmation_sent_at ?? null,
            error: err?.message ?? null,
          });
        }
        if (err) throw err;
        const outcome = classifySignUpResult(data, trimmedEmail);
        if (outcome.kind === 'session') {
          clearDraft();
          await registerPassenger(phoneTrimmed, fullName ?? undefined).catch(() => null);
          await replaceAfterAuth(replace, data.session?.user?.id);
        } else if (outcome.kind === 'needs_verify') {
          replace('VerifyEmail', { email: trimmedEmail });
        } else {
          setLoading(false);
          setError(
            'Este email ya está registrado en Lifty. Iniciá sesión en lugar de crear una cuenta nueva.',
          );
          return;
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data.session) {
          const metaName =
            (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name ??
            fullName ??
            undefined;
          await registerPassenger(undefined, metaName).catch(() => {});
          await replaceAfterAuth(replace, data.session.user?.id);
        }
      }
    } catch (err) {
      if (!isSignUp && isInvalidLoginCredentialsError(err) && !highlightGoogle) {
        // Cached per email in fetchLoginHint — only one network call per address.
        const hint = await fetchLoginHint(email.trim()).catch(() => null);
        if (hint?.googleOnly) {
          setError(GOOGLE_ONLY_LOGIN_MESSAGE);
          setHighlightGoogle(true);
          return;
        }
      }
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError(null);
    setInfo(null);
    setHighlightGoogle(false);
    setGoogleLoading(true);
    // New Google attempt — clear prior handoff lock. Cover only after session
    // (plain root bridge, no L+tagline) so cancel never flashes brand lockup.
    resetPostOAuthHandoff();
    try {
      const session = await signInWithGoogle();
      if (__DEV__) {
        console.log('[oauth] handleGoogle session?', Boolean(session?.user));
      }
      if (session?.user) {
        beginOAuthBrandBridge();
        const metaName =
          (session.user.user_metadata as { full_name?: string } | undefined)?.full_name ??
          fullName ??
          undefined;
        // Sync Zustand before any API/handoff — Bearer comes only from the store.
        // Without this, getProfile 401 → clearAuth → Welcome bounce.
        useAuthStore
          .getState()
          .setSession(session.access_token, session.user.id, session.user.email ?? null, metaName);
        await registerPassenger(undefined, metaName).catch(() => {});
        await replaceAfterGoogleAuth(replace, session.user.id, 'LoginCredentials');
        return;
      }
      // Cancel / dismiss without session — stay on login, no fake success.
      endOAuthBrandBridge();
      setInfo('Inicio de sesión cancelado.');
    } catch (err) {
      endOAuthBrandBridge();
      setError(getFriendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const form = (
    <View style={styles.form}>
      <Text style={styles.brand}>Lifty</Text>
      <Text style={styles.title}>{isSignUp ? 'Creá tu cuenta' : 'Iniciar sesión'}</Text>
      <Text style={styles.subtitle}>
        {isSignUp ? 'Empezá a viajar hoy' : 'Ingresá tus datos para continuar'}
      </Text>

      <Input
        placeholder="Email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (highlightGoogle) {
            setHighlightGoogle(false);
            setError(null);
          }
        }}
        keyboardType="email-address"
        style={styles.inputField}
      />
      <View style={styles.passwordRow}>
        <Input
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          style={styles.inputField}
        />
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={styles.eyeButton}
          hitSlop={8}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.mediumGray}
          />
        </TouchableOpacity>
      </View>

      {isSignUp ? (
        <>
          <Input
            placeholder="Repetir contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            style={styles.inputField}
            error={
              confirmPassword.length > 0 && password !== confirmPassword
                ? 'Las contraseñas no coinciden'
                : undefined
            }
          />
          <Input
            placeholder="Teléfono (opcional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.inputField}
          />
          <Text style={styles.fieldHint}>Podés completarlo después desde tu perfil</Text>
        </>
      ) : (
        <TouchableOpacity onPress={() => navigate('ForgotPassword')}>
          <Text style={styles.forgotPassword}>¿Olvidaste tu clave?</Text>
        </TouchableOpacity>
      )}

      <Button
        variant="primary"
        onPress={handleSubmit}
        loading={loading}
        disabled={isDisabled}
        style={styles.button}
      >
        {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
      </Button>

      <Text style={styles.orDivider}>o</Text>

      <Button
        variant="secondary"
        onPress={handleGoogle}
        loading={googleLoading}
        style={highlightGoogle ? { ...styles.button, ...styles.googleHighlight } : styles.button}
      >
        Continuar con Google
      </Button>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      {!isSignUp ? (
        <TouchableOpacity
          onPress={() => {
            setError(null);
            setInfo(null);
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setPhone('');
            navigate('Register');
          }}
        >
          <Text style={styles.switchAuth}>¿No tenés cuenta? Crear cuenta</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            clearDraft();
            setError(null);
            setInfo(null);
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setPhone('');
          }}
        >
          <Text style={styles.switchAuth}>¿Ya tenés cuenta? Iniciar sesión</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const scrollBottom = Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backButton} hitSlop={8}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      {/*
        Android: no KeyboardAvoidingView — el SO ya hace resize y KAV deja un hueco gris
        arriba del teclado. iOS: padding simple + ScrollView insets nativos.
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {form}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {form}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
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
    fontFamily: theme.fontFamily.medium,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  brand: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  fieldHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    marginTop: -theme.spacing.sm,
  },
  inputField: {
    width: '100%',
  },
  passwordRow: {
    position: 'relative',
    width: '100%',
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing.md,
    top: 16,
    zIndex: 1,
  },
  button: {
    width: '100%',
  },
  googleHighlight: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  orDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  info: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  switchAuth: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
