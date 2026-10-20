import { useRegistrationDraftStore } from '@/store/registrationDraftStore';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { getFriendlyAuthError } from '../lib/authErrors';
import { theme } from '../theme';

export function RegisterScreen() {
  const { goBack, navigate } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle } = useAuth();
  const setFullName = useRegistrationDraftStore((s) => s.setFullName);
  const clearDraft = useRegistrationDraftStore((s) => s.clear);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim().length > 0 && surname.trim().length > 0 && accepted;

  const handleSubmit = () => {
    if (!isValid) {
      setError('Completá nombre y apellido y aceptá los términos.');
      return;
    }
    setError(null);
    setFullName(`${name} ${surname}`);
    setLoading(true);
    navigate('Terms', { from: 'register' });
    setLoading(false);
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    if (!accepted) {
      setError('Aceptá los términos y condiciones para continuar con Google.');
      return;
    }
    setError(null);
    setGoogleLoading(true);
    try {
      clearDraft();
      await signInWithGoogle();
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const form = (
    <View style={styles.form}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Lifty</Text>
        <Text style={styles.title}>Creá tu cuenta</Text>
        <Text style={styles.subtitle}>Empezá a viajar hoy</Text>
      </View>

      <Input placeholder="Nombre" value={name} onChangeText={setName} autoFocus />
      <Input placeholder="Apellido" value={surname} onChangeText={setSurname} />

      <Pressable style={styles.termsRow} onPress={() => setAccepted(!accepted)}>
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.termsText}>
          Acepto{' '}
          <Text style={styles.termsLink} onPress={() => navigate('Terms')}>
            términos y condiciones
          </Text>
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        variant="primary"
        onPress={handleSubmit}
        loading={loading}
        disabled={!isValid || googleLoading}
      >
        Continuar
      </Button>

      <Text style={styles.orDivider}>o</Text>

      <Button
        variant="secondary"
        onPress={handleGoogle}
        loading={googleLoading}
        disabled={loading || googleLoading}
      >
        Continuar con Google
      </Button>

      <Text style={styles.loginLink} onPress={() => navigate('LoginCredentials')}>
        ¿Ya tenés cuenta? <Text style={styles.loginLinkBold}>Iniciar sesión</Text>
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <Text style={styles.back} onPress={goBack}>
          ← Volver
        </Text>
      </View>

      {/*
        Android: no KeyboardAvoidingView — el SO ya hace resize y KAV deja un hueco gris
        arriba del teclado. iOS: padding simple + ScrollView insets nativos.
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {form}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {form}
        </ScrollView>
      )}
    </View>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  brandBlock: {
    gap: theme.spacing.xs,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  brand: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    letterSpacing: -0.4,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    flex: 1,
  },
  termsLink: {
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  orDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  loginLink: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
    marginTop: theme.spacing.sm,
  },
  loginLinkBold: {
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
});
