import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export function RegisterScreen() {
  const { goBack } = useAppNavigation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim().length > 0 && surname.trim().length > 0 && accepted;

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Completá nombre y apellido y aceptá los términos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      router.push({ pathname: '/login-phone', params: { fullName: `${name} ${surname}` } });
    } finally {
      setLoading(false);
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
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>Lifty</Text>
            <Text style={styles.title}>¡Crea tu cuenta!</Text>
            <Text style={styles.subtitle}>Empezá a viajar hoy</Text>
          </View>

          <View style={styles.form}>
            <Input placeholder="Nombre" value={name} onChangeText={setName} autoFocus />
            <Input placeholder="Apellido" value={surname} onChangeText={setSurname} />
          </View>

          <Pressable style={styles.termsRow} onPress={() => setAccepted(!accepted)}>
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.termsText}>Acepto términos y condiciones</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button variant="primary" onPress={handleSubmit} loading={loading} disabled={!isValid}>
            Continuar
          </Button>

          <Text style={styles.loginLink} onPress={() => router.replace('/login-phone')}>
            ¿Ya tienes cuenta? <Text style={styles.loginLinkBold}>Iniciar sesión</Text>
          </Text>
        </View>
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
  brandBlock: {
    gap: theme.spacing.xs,
  },
  brand: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
  form: {
    gap: theme.spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  termsText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.white,
    fontFamily: theme.fontFamily.regular,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  loginLink: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.white,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.md,
  },
  loginLinkBold: {
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
});
