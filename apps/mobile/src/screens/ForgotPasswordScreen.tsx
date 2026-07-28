import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useState } from 'react';
import {
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
import { LoadingOverlay } from '../components/feedback/LoadingOverlay';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useForgotPassword, useResetPassword } from '../hooks/useAuth';
import { resolvePostAuthRoute } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { loading } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [step, setStep] = useState<'email' | 'reset'>('email');

  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPassword();

  const handleSendCode = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }

    try {
      await forgotPassword.mutateAsync({ email: email.trim() });
      setStep('reset');
    } catch (err: any) {
      const message = err?.message ?? 'Error al enviar el codigo';
      setError(message);
    }
  };

  const handleReset = async () => {
    setError(null);
    setInfo(null);
    if (code.length !== 6) {
      setError('Ingresa el codigo de 6 digitos');
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
      await resetPassword.mutateAsync({ email: email.trim(), code, password });

      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }

      const termsAccepted = useAuthStore.getState().termsAccepted;
      if (termsAccepted) {
        if (route.screen) {
          navigation.replace(route.screen);
        }
      } else {
        navigation.replace('Terms');
      }
    } catch (err: any) {
      const message = err?.message ?? 'Error al restablecer la contrasena';
      setError(message);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setInfo(null);
    try {
      await forgotPassword.mutateAsync({ email: email.trim() });
      setInfo('Te enviamos un nuevo codigo');
    } catch (err: any) {
      const message = err?.message ?? 'Error al reenviar el codigo';
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'reset') {
              setStep('email');
              setError(null);
              setInfo(null);
            } else {
              navigation.goBack();
            }
          }}
        >
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
          {step === 'email' ? (
            <>
              <Text style={styles.title}>Recuperar contrasena</Text>
              <Text style={styles.subtitle}>
                Ingresa tu email y te enviamos un codigo para restablecerla
              </Text>
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
              <View style={{ height: 8 }} />
              <Button
                title="ENVIAR CODIGO"
                onPress={handleSendCode}
                loading={forgotPassword.isPending}
                disabled={!email.trim() || forgotPassword.isPending}
                style={styles.button}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>Restablecer contrasena</Text>
              <Text style={styles.subtitle}>
                Te enviamos un codigo de 6 digitos a {email.trim()}
              </Text>
              <View style={{ height: 16 }} />
              <OTPInput length={6} value={code} onChange={setCode} />
              <View style={{ height: 16 }} />
              <Input
                placeholder="Nueva contrasena"
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
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <View style={styles.showPasswordRow}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.colors.mediumGray}
                  />
                  <Text style={styles.showPasswordText}>
                    {showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={{ height: 8 }} />
              <Button
                title="RESTABLECER CONTRASENA"
                onPress={handleReset}
                loading={resetPassword.isPending}
                disabled={
                  code.length !== 6 || !password || !confirmPassword || resetPassword.isPending
                }
                style={styles.button}
              />
              <TouchableOpacity onPress={handleResendCode} disabled={forgotPassword.isPending}>
                <Text style={styles.resendLink}>Reenviar codigo</Text>
              </TouchableOpacity>
            </>
          )}
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          {info !== null && <Text style={styles.infoText}>{info}</Text>}
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
  inputField: {
    marginBottom: theme.spacing.sm,
  },
  showPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: theme.spacing.sm,
  },
  showPasswordText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
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
});
