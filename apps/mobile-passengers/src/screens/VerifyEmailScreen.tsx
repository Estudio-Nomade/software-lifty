import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
import { registerPassenger } from '../api/passenger';
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getFriendlyAuthError } from '../lib/authErrors';
import { resendSignupEmailOtp, verifySignupEmailOtp } from '../lib/signupEmail';
import { supabase } from '../lib/supabase';
import { useRegistrationDraftStore } from '../store/registrationDraftStore';
import { theme } from '../theme';

export function VerifyEmailScreen() {
  const { goBack, replace } = useAppNavigation();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';
  const draftFullName = useRegistrationDraftStore((s) => s.fullName);
  const clearDraft = useRegistrationDraftStore((s) => s.clear);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      // Signup confirmation OTP first; email OTP fallback (parity with driver useAuth).
      await verifySignupEmailOtp(supabase, email, code);

      const metaName =
        draftFullName ||
        (
          (await supabase.auth.getUser()).data.user?.user_metadata as
            | { full_name?: string }
            | undefined
        )?.full_name;
      await registerPassenger(undefined, metaName ?? undefined).catch(() => {});
      clearDraft();
      replace('LocationPermissions');
    } catch (e) {
      setError(getFriendlyAuthError(e));
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setError(null);
    setInfo(null);
    try {
      // Must resend signup confirmation — not signInWithOtp (magic/login).
      await resendSignupEmailOtp(supabase, email);
      setInfo('Te enviamos un nuevo código. Revisá inbox y spam.');
      setResendCooldown(60);
    } catch (e) {
      setError(getFriendlyAuthError(e));
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
            <Ionicons name="mail-outline" size={48} color={theme.colors.primary} />
            <Text style={styles.title}>¡Casi listo!</Text>
            <Text style={styles.subtitle}>
              Te enviamos un código de 6 dígitos. Si no lo ves, revisá spam.
            </Text>
            <Text style={styles.email}>{email}</Text>

            <OTPInput value={code} onChange={setCode} autoFocus />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

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
  info: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
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
