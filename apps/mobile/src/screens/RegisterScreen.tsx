import type React from 'react';
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
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { LoadingOverlay } from '../components/feedback/LoadingOverlay';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useResendCode, useSignUp, useVerifyEmail } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const RegisterScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);
  const { loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [verificationCode, setVerificationCode] = useState('');

  const signUp = useSignUp();
  const verifyEmail = useVerifyEmail();
  const resendCode = useResendCode();

  const passwordMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  const handleRegister = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }

    try {
      await signUp.mutateAsync({ email: email.trim(), password });
      setStep('verify');
    } catch (err: any) {
      const message = err?.message ?? err?.response?.data?.message ?? 'Error al crear la cuenta';
      setError(message);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setInfo(null);
    try {
      await resendCode.mutateAsync({ email: email.trim() });
      setInfo('Te enviamos un nuevo codigo');
    } catch (err: any) {
      const message = err?.message ?? 'Error al reenviar el codigo';
      setError(message);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) return;
    setError(null);
    setInfo(null);

    try {
      await verifyEmail.mutateAsync({ email: email.trim(), code: verificationCode });
      setDriverStatus('pending');
      navigation.replace('LoginCredentials', { email: email.trim() });
    } catch (err: any) {
      const message = err?.message ?? err?.response?.data?.message ?? 'Error al verificar';
      setError(message);
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
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setStep('form');
              setError(null);
            }}
          >
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.verifyContent}>
          <Text style={styles.title}>Verifica tu email</Text>
          <Text style={styles.subtitle}>Te enviamos un codigo de 6 digitos a {email}</Text>
          <View style={{ height: 24 }} />
          <OTPInput length={6} value={verificationCode} onChange={setVerificationCode} />
          <View style={{ height: 16 }} />
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          {info !== null && <Text style={styles.infoText}>{info}</Text>}
          <Button
            title={
              verificationCode.length === 6 && !verifyEmail.isPending
                ? 'VERIFICAR CODIGO'
                : 'INICIAR SESION'
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
            <Text style={styles.resendLink}>Reenviar codigo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: 16 }} />
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Ingresa tu email y contrasena para registrarte</Text>
          <View style={{ height: 8 }} />
          <Input
            placeholder="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.inputField}
          />
          <Input
            placeholder="Contrasena"
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
            placeholder="Confirmar contrasena"
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
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.showPasswordRow}
          >
            <Text style={styles.showPasswordText}>
              {showPassword ? '🙈 Ocultar contrasena' : '👁 Mostrar contrasena'}
            </Text>
          </TouchableOpacity>
          {passwordMismatch && (
            <Text style={styles.mismatchText}>Las contrasenas no coinciden</Text>
          )}
          {passwordMatch && <Text style={styles.matchText}>✓ Las contrasenas coinciden</Text>}
          <View style={{ height: 8 }} />
          <Button
            title="CREAR CUENTA"
            onPress={handleRegister}
            loading={signUp.isPending}
            disabled={!email.trim() || !password || !confirmPassword || signUp.isPending}
            style={styles.button}
          />
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity onPress={() => navigation.navigate('LoginCredentials')}>
            <Text style={styles.loginLink}>Ya tenes cuenta? Inicia sesion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  backText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.sm,
  },
  verifyContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    alignItems: 'center',
  },
  inputField: {
    marginBottom: theme.spacing.sm,
  },
  showPasswordRow: {
    marginVertical: theme.spacing.sm,
  },
  showPasswordText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  mismatchText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    marginTop: theme.spacing.xs,
  },
  matchText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    marginTop: theme.spacing.xs,
  },
  button: {
    marginTop: theme.spacing.sm,
    width: 327,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  resendLink: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
  loginLink: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});
