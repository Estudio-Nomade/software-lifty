import { useRegistrationDraftStore } from '@/store/registrationDraftStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

      router.replace('/location-permissions');
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
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.back} onPress={goBack}>
              ← Volver
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    height: theme.dimensions.navbarHeight,
    justifyContent: 'center',
  },
  back: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.medium,
    paddingVertical: theme.spacing.sm,
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
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
    fontFamily: theme.fontFamily.medium,
    marginTop: theme.spacing.sm,
  },
});
