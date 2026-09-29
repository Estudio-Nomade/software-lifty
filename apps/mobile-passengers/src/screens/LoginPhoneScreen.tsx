import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export function LoginPhoneScreen() {
  const { goBack } = useAppNavigation();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length >= 10;

  const handleSend = async () => {
    setError(null);
    if (!isValid) {
      setError('Número inválido. Mínimo 10 dígitos.');
      return;
    }
    const fullPhone = `+54${digits.startsWith('54') ? digits.slice(2) : digits}`;
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (authError) throw authError;
      router.push({ pathname: '/login-otp', params: { phone: fullPhone } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el código.');
    } finally {
      setLoading(false);
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
            <Text style={styles.close} onPress={goBack}>
              ← Volver
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>Ingresa tu celular</Text>
            <Text style={styles.subtitle}>
              Te enviaremos un código por SMS para verificar tu número.
            </Text>

            <View style={styles.row}>
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇦🇷</Text>
                <Text style={styles.code}>+54</Text>
              </View>
              <View style={styles.phoneInput}>
                <Input
                  placeholder="11 1234 5678"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  error={error ?? undefined}
                  autoFocus
                />
              </View>
            </View>

            <Button variant="primary" onPress={handleSend} loading={loading} disabled={!isValid}>
              Enviar código
            </Button>
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
  close: {
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
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.inputRadius,
    paddingHorizontal: theme.spacing.md,
    height: theme.dimensions.inputHeight,
    gap: theme.spacing.sm,
  },
  flag: {
    fontSize: 18,
  },
  code: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  phoneInput: {
    flex: 1,
  },
});
