import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export function VerifyEmailScreen() {
  const { goBack, replace } = useAppNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';
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
        email,
        token: code,
        type: 'email',
      });
      if (authError) throw authError;
      replace('LocationPermissions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido o expirado.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (authError) throw authError;
      setResendCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reenviar el código.');
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
            <TouchableOpacity onPress={goBack}>
              <Text style={styles.back}>←</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.icon}>📧</Text>
            <Text style={styles.title}>¡Casi listo!</Text>
            <Text style={styles.subtitle}>Te enviamos un código a tu email</Text>
            <Text style={styles.email}>{email}</Text>

            <OTPInput value={code} onChange={setCode} autoFocus />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              variant="primary"
              onPress={handleVerify}
              loading={loading}
              disabled={code.length !== 6}
            >
              VERIFICAR
            </Button>

            <Text style={styles.resend} onPress={handleResend}>
              {resendCooldown > 0
                ? `No recibiste el código? Reenviar (${resendCooldown}s)`
                : 'No recibiste el código? Reenviar'}
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
    backgroundColor: theme.colors.deepBlue,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: theme.fontSize['5xl'],
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  email: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  resend: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
});
