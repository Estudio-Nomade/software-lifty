import { useRegistrationDraftStore } from '@/store/registrationDraftStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export function LoginOTPScreen() {
  const { goBack } = useAppNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone ?? '';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: 'sms',
      });
      if (authError) throw authError;

      const draftFullName = useRegistrationDraftStore.getState().fullName;
      if (draftFullName) {
        try {
          await supabase.auth.updateUser({ data: { full_name: draftFullName } });
        } catch {
          // name update is non-blocking; user is already authenticated
        } finally {
          useRegistrationDraftStore.getState().clear();
        }
      }

      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !phone) return;
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({ phone });
      if (authError) throw authError;
      setResendCooldown(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reenviar.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <Text style={styles.back} onPress={goBack}>
            ←
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Verificación</Text>
          <Text style={styles.subtitle}>
            Ingresa el código de 6 dígitos que enviamos a{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>

          <OTPInput value={code} onChange={setCode} autoFocus />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            variant="primary"
            onPress={handleVerify}
            loading={loading}
            disabled={code.length !== 6}
          >
            Verificar
          </Button>

          <Text style={styles.resend} onPress={handleResend}>
            {resendCooldown > 0
              ? `Reenviar en ${resendCooldown}s`
              : '¿No recibiste el código? Reenviar'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    height: 56,
    justifyContent: 'center',
  },
  back: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: '700',
    padding: theme.spacing.sm,
  },
  body: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
  phone: {
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  resend: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.sm,
  },
});
