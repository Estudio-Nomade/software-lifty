import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
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

function mapDeleteError(err: unknown): string {
  const ax = err as {
    response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
    message?: string;
  };
  const code = ax.response?.data?.error?.code;
  if (code === 'ACTIVE_TRIP' || ax.response?.status === 409) {
    return 'Tenés un viaje en curso. Terminá o cancelá el viaje antes de eliminar la cuenta.';
  }
  return ax.response?.data?.error?.message ?? ax.message ?? 'No se pudo eliminar la cuenta';
}

export function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { session, signInWithGoogle } = useAuth();
  const signOut = useSignOut();
  const email = session?.user?.email ?? '';
  const canPassword = hasProvider(session, 'email');
  const canGoogle = hasProvider(session, 'google');

  /** Identity that must match after reauth — frozen when entering reauth. */
  const expectedUserIdRef = useRef<string | null>(session?.user?.id ?? null);

  const [step, setStep] = useState<Step>('warn');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (step === 'warn') return 'Leé esto antes de seguir';
    if (step === 'reauth') return 'Confirmá que sos vos';
    return 'Listo';
  }, [step]);

  const goReauth = () => {
    expectedUserIdRef.current = session?.user?.id ?? null;
    if (!expectedUserIdRef.current) {
      setError('No hay sesión activa. Volvé a iniciar sesión e intentá de nuevo.');
      return;
    }
    setError(null);
    setStep('reauth');
  };

  const assertSameUser = (userId: string | null | undefined) => {
    const expected = expectedUserIdRef.current;
    if (!expected || !userId || userId !== expected) {
      throw new Error('Esa no es tu misma cuenta de Lifty. Volvé a intentarlo con la tuya.');
    }
  };

  /**
   * 1) POST delete (must succeed for "done")
   * 2) local signOut best-effort (failure still shows success — request already registered)
   */
  const submitDeletion = async () => {
    setLoading(true);
    setError(null);
    let registered = false;
    try {
      await apiClient.post('/account-deletion/request', { confirm: true });
      registered = true;
      setStep('done');
      try {
        await signOut.mutateAsync();
      } catch {
        /* request already accepted server-side */
      }
    } catch (err: unknown) {
      if (!registered) setError(mapDeleteError(err));
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
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim(),
      });
      if (authErr) throw authErr;
      assertSameUser(data.user?.id ?? data.session?.user?.id);
      await submitDeletion();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar la contraseña');
      setLoading(false);
    }
  };

  const reauthGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await signInWithGoogle();
      assertSameUser(next?.user?.id);
      await submitDeletion();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar con Google');
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Eliminar cuenta" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{subtitle}</Text>

        {step === 'warn' ? (
          <Card>
            <Text style={styles.warnTitle}>Esto borra tu cuenta para siempre</Text>
            <Text style={styles.body}>
              No es lo mismo que cerrar sesión. Si seguís, pedimos borrar tu cuenta de Lifty: tu
              perfil, fotos, documentos y el acceso a la app.
            </Text>
            <Text style={styles.body}>
              Si también usás Lifty como pasajero con la misma cuenta, se borra todo junto.
            </Text>
            <Text style={styles.body}>
              Si tenés un viaje en curso, terminarlo o cancelarlo antes.
            </Text>
            <Button
              title="Continuar"
              variant="danger"
              onPress={goReauth}
              style={styles.btn}
              textStyle={{ color: theme.colors.dangerRed }}
            />
            <Button title="Cancelar" variant="secondary" onPress={() => navigation.goBack()} />
          </Card>
        ) : null}

        {step === 'reauth' ? (
          <Card>
            <Text style={styles.warnTitle}>Para seguir, confirmá que sos vos</Text>
            <Text style={styles.body}>Así nos aseguramos de que nadie más borre tu cuenta.</Text>
            {canPassword ? (
              <>
                <Text style={styles.label}>Tu contraseña ({email})</Text>
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
                  title={loading ? 'Borrando…' : 'Confirmar y borrar cuenta'}
                  variant="danger"
                  onPress={reauthPassword}
                  disabled={loading}
                  loading={loading}
                  style={styles.btn}
                  textStyle={{ color: theme.colors.dangerRed }}
                />
              </>
            ) : null}
            {canGoogle ? (
              <Button
                title={loading ? 'Borrando…' : 'Confirmar con Google y borrar'}
                variant="danger"
                onPress={reauthGoogle}
                disabled={loading}
                loading={loading}
                style={styles.btn}
                textStyle={{ color: theme.colors.dangerRed }}
              />
            ) : null}
            {!canPassword && !canGoogle ? (
              <Text style={styles.body}>
                No pudimos pedir tu confirmación acá. Escribinos a soporte y te ayudamos.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {step === 'done' ? (
          <Card>
            <Ionicons name="checkmark-circle" size={48} color={theme.colors.turquoise} />
            <Text style={styles.warnTitle}>Listo, ya pedimos el borrado</Text>
            <Text style={styles.body}>
              Estamos eliminando tu cuenta. Te avisamos por email cuando termine. En este teléfono
              ya cerramos la sesión.
            </Text>
            <Button title="Volver al inicio" onPress={() => navigation.replace('Welcome')} />
          </Card>
        ) : null}

        {error ? (
          <TouchableOpacity onPress={() => setError(null)} style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        {step !== 'done' ? (
          <Text style={styles.footerNote}>¿Problemas? Escribinos a admin@liftyviajes.com</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.lightGray },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  subtitle: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.sm,
  },
  warnTitle: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  body: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  label: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    color: theme.colors.deepBlue,
    backgroundColor: theme.colors.white,
  },
  btn: { marginBottom: theme.spacing.sm },
  errorBox: {
    backgroundColor: '#FDECEA',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  errorText: { color: theme.colors.dangerRed, fontSize: theme.fontSize.sm },
  footerNote: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.md,
  },
});
