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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const isDisabled = !email || !password || loading;

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (err) throw err;
        clearDraft();
        if (data.session) {
          registerPassenger().catch(() => {});
          replace('Home');
        } else if (data.user) {
          setInfo(
            'Te enviamos un email de verificación. Revisá tu casilla para activar tu cuenta.',
          );
        } else {
          setError(
            'Este email ya está registrado en Lifty. Iniciá sesión en lugar de crear una cuenta nueva.',
          );
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data.session) {
          registerPassenger().catch(() => {});
          replace('Home');
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
              <Text style={styles.backText}>← Volver</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Elegí tu email y contraseña para crear tu cuenta'
                : 'Ingresá tu email y contraseña'}
            </Text>
            <View style={styles.spacer} />

            <Input
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <View style={styles.gap} />
            <View style={styles.passwordRow}>
              <Input
                placeholder="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
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
            <View style={styles.gap} />
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
            <View style={styles.gap} />

            {!isSignUp ? (
              <TouchableOpacity onPress={() => navigate('ForgotPassword')}>
                <Text style={styles.forgotPassword}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  clearDraft();
                  setError(null);
                  setInfo(null);
                  setEmail('');
                  setPassword('');
                }}
              >
                <Text style={styles.forgotPassword}>¿Ya tenés cuenta? Iniciá sesión</Text>
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
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    height: theme.dimensions.navbarHeight,
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
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    width: 327,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    width: 327,
    marginTop: theme.spacing.sm,
  },
  spacer: {
    height: theme.spacing.md,
  },
  gap: {
    height: theme.spacing.md,
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
    width: 327,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    width: 327,
    marginTop: theme.spacing.sm,
  },
  info: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    width: 327,
    marginTop: theme.spacing.sm,
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
});
