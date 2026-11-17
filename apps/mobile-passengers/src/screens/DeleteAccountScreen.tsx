import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestAccountDeletion } from '../api/passenger';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

type Step = 'warn' | 'reauth' | 'done';

function hasProvider(
  session: { user?: { identities?: Array<{ provider?: string }> } } | null,
  p: string,
) {
  const ids = session?.user?.identities ?? [];
  return ids.some((i) => (i.provider ?? '').toLowerCase() === p);
}

export function DeleteAccountScreen() {
  const { goBack, replace, navigate } = useAppNavigation();
  const { session, signInWithGoogle, signOut } = useAuth();
  const email = session?.user?.email ?? '';
  const canPassword = hasProvider(session, 'email');
  const canGoogle = hasProvider(session, 'google');

  const [step, setStep] = useState<Step>('warn');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = useMemo(() => {
    if (step === 'warn') return 'Eliminar cuenta';
    if (step === 'reauth') return 'Confirmá tu identidad';
    return 'Solicitud registrada';
  }, [step]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await requestAccountDeletion();
      await signOut();
      setStep('done');
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
        message?: string;
      };
      const code = ax.response?.data?.error?.code;
      const msg =
        ax.response?.data?.error?.message ?? ax.message ?? 'No se pudo eliminar la cuenta';
      if (code === 'ACTIVE_TRIP' || ax.response?.status === 409) {
        setError(
          'Tenés un viaje en curso. Terminá o cancelá el viaje antes de eliminar la cuenta.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const reauthPassword = async () => {
    if (!email || !password.trim()) {
      setError('Ingresá tu contraseña');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim(),
      });
      if (authErr) throw authErr;
      await handleDelete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar la contraseña');
      setLoading(false);
    }
  };

  const reauthGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      await handleDelete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar con Google');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.deepBlue} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{header}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'warn' ? (
          <View style={styles.card}>
            <Text style={styles.title}>Esta acción no es cerrar sesión</Text>
            <Text style={styles.body}>
              Vas a pedir borrar tu cuenta de Lifty. Se eliminan datos personales y tokens. Si
              también sos conductor en la misma cuenta, se borra toda la identidad. Viajes y montos
              pueden quedar anonimizados por obligaciones legales.
            </Text>
            <Button variant="danger" onPress={() => setStep('reauth')} style={styles.btn}>
              Continuar
            </Button>
            <Button variant="secondary" onPress={goBack}>
              Cancelar
            </Button>
          </View>
        ) : null}

        {step === 'reauth' ? (
          <View style={styles.card}>
            <Text style={styles.title}>Confirmá que sos vos</Text>
            {canPassword ? (
              <>
                <Text style={styles.label}>Contraseña ({email})</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="Tu contraseña"
                  placeholderTextColor={theme.colors.mediumGray}
                />
                <Button
                  variant="danger"
                  onPress={reauthPassword}
                  disabled={loading}
                  loading={loading}
                  style={styles.btn}
                >
                  Verificar y eliminar
                </Button>
              </>
            ) : null}
            {canGoogle ? (
              <Button
                variant="danger"
                onPress={reauthGoogle}
                disabled={loading}
                loading={loading}
                style={styles.btn}
              >
                Verificar con Google y eliminar
              </Button>
            ) : null}
            {!canPassword && !canGoogle ? (
              <Text style={styles.body}>No detectamos método de reauth. Contactá soporte.</Text>
            ) : null}
            {loading ? (
              <ActivityIndicator color={theme.colors.dangerRed} style={{ marginTop: 8 }} />
            ) : null}
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={48} color={theme.colors.primary} />
            <Text style={styles.title}>Solicitud registrada</Text>
            <Text style={styles.body}>
              Empezamos a eliminar tu cuenta. Vas a recibir un email cuando termine. Ya cerramos la
              sesión acá.
            </Text>
            <Button onPress={() => replace('Welcome')}>Volver al inicio</Button>
          </View>
        ) : null}

        {error ? (
          <TouchableOpacity onPress={() => setError(null)} style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        {step !== 'done' ? (
          <TouchableOpacity onPress={() => navigate('Support')}>
            <Text style={styles.footerNote}>
              ¿Problemas? Escribinos a soporte o admin@liftyviajes.com
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.lightGray },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
  },
  headerTitle: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
  },
  body: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  label: { color: theme.colors.mediumGray, fontSize: theme.fontSize.sm },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.deepBlue,
    backgroundColor: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },
  btn: { marginTop: theme.spacing.xs },
  errorBox: {
    backgroundColor: '#FDECEA',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  errorText: { color: theme.colors.dangerRed, fontSize: theme.fontSize.sm },
  footerNote: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
});
