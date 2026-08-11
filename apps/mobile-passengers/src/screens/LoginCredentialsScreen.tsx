import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getFriendlyAuthError } from '../lib/authErrors';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export function LoginCredentialsScreen() {
  const { goBack, navigate } = useAppNavigation();
  const { signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const isDisabled = !email || !password || loginLoading;

  const handleLogin = async () => {
    setError(null);
    setLoginLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError(null);
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Iniciar sesión</Text>
          <Text style={styles.subtitle}>Ingresá tu email y contraseña</Text>
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
            onPress={handleLogin}
            loading={loginLoading}
            disabled={isDisabled}
            style={styles.button}
          >
            INICIAR SESIÓN
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
          <View style={styles.gap} />

          <TouchableOpacity onPress={() => navigate('ForgotPassword')}>
            <Text style={styles.forgotPassword}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>
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
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
});
