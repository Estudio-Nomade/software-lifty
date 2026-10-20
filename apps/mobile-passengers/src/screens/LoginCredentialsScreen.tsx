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
import { registerPassenger } from '../api/passenger';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getFriendlyAuthError } from '../lib/authErrors';
import { classifySignUpResult } from '../lib/signupEmail';
import { supabase } from '../lib/supabase';
import { useRegistrationDraftStore } from '../store/registrationDraftStore';
import { theme } from '../theme';

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

  const isDisabled =
    !email ||
    !password ||
    loading ||
    (isSignUp && (!confirmPassword || password !== confirmPassword));

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
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
          registerPassenger(phoneTrimmed, fullName ?? undefined).catch(() => {});
          replace('LocationPermissions');
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
          registerPassenger(undefined, metaName).catch(() => {});
          replace('LocationPermissions');
        }
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError(null);
    setInfo(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
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
        onChangeText={setEmail}
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
        style={styles.button}
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
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
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
