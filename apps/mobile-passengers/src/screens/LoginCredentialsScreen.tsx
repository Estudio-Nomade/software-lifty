import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
        clearDraft();
        const outcome = classifySignUpResult(data, trimmedEmail);
        if (outcome.kind === 'session') {
          registerPassenger(phoneTrimmed).catch(() => {});
          replace('LocationPermissions');
        } else if (outcome.kind === 'needs_verify') {
          // confirmation_sent_at means Supabase accepted the send; delivery is SMTP/spam.
          // User can resend on VerifyEmail (type signup).
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
          registerPassenger().catch(() => {});
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={goBack} style={styles.backButton}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.brand}>Lifty</Text>
            <Text style={styles.title}>
              {isSignUp ? '¡Crea tu cuenta!' : '¡Bienvenido de vuelta!'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Empieza a viajar hoy' : 'Ingresá tus datos para continuar'}
            </Text>
            <View style={styles.spacer} />

            <Input
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              style={styles.inputField}
            />
            <View style={styles.gap} />
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
                <View style={styles.gap} />
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
                <View style={styles.gap} />
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

            <View style={styles.spacer} />

            <Button
              variant="primary"
              onPress={handleSubmit}
              loading={loading}
              disabled={isDisabled}
              style={styles.button}
            >
              {isSignUp ? 'CREAR CUENTA' : 'INICIAR SESIÓN'}
            </Button>

            <Text style={styles.orDivider}>─── o ───</Text>

            <Button
              variant="secondary"
              onPress={handleGoogle}
              loading={googleLoading}
              style={styles.button}
            >
              CONTINUAR CON GOOGLE
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
                <Text style={styles.switchAuth}>¿No tienes cuenta? Crear cuenta</Text>
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
                <Text style={styles.switchAuth}>¿Ya tienes cuenta? Iniciar sesión</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    height: theme.dimensions.navbarHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
    alignSelf: 'flex-start',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.regular,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  brand: {
    fontSize: theme.fontSize['4xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    marginTop: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.xs,
  },
  spacer: {
    height: theme.spacing.lg,
  },
  gap: {
    height: theme.spacing.md,
  },
  fieldHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.xs,
  },
  inputField: {
    borderWidth: 0,
  },
  passwordRow: {
    position: 'relative',
    width: '100%',
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing.md,
    top: 14,
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
    marginVertical: theme.spacing.md,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  info: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.primary,
    marginTop: theme.spacing.sm,
  },
  switchAuth: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});
