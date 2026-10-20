import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
      await resendSignupEmailOtp(supabase, email);
      setInfo('Te enviamos un nuevo código. Revisá inbox y spam.');
      setResendCooldown(60);
    } catch (e) {
      setError(getFriendlyAuthError(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={8}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.form}>
          <Ionicons name="mail-outline" size={48} color={theme.colors.primary} />
          <Text style={styles.title}>Casi listo</Text>
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
            Verificar
          </Button>

          <Text style={styles.resend} onPress={handleResend}>
            {resendCooldown > 0
              ? `¿No recibiste el código? Reenviar (${resendCooldown}s)`
              : '¿No recibiste el código? Reenviar'}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: theme.dimensions.navbarHeight,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  back: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.medium,
    paddingVertical: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    letterSpacing: -0.4,
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
    fontFamily: theme.fontFamily.medium,
  },
});
