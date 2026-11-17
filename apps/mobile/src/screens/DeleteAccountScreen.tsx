import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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

export function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { session, signInWithGoogle } = useAuth();
  const signOut = useSignOut();
  const email = session?.user?.email ?? '';
  const canPassword = hasProvider(session, 'email');
  const canGoogle = hasProvider(session, 'google');

  const [step, setStep] = useState<Step>('warn');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (step === 'warn') return 'Leé con atención';
    if (step === 'reauth') return 'Confirmá tu identidad';
    return 'Listo';
  }, [step]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/account-deletion/request', { confirm: true });
      await signOut.mutateAsync();
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
            <Text style={styles.warnTitle}>Esta acción no es cerrar sesión</Text>
            <Text style={styles.body}>
              Vas a pedir borrar tu cuenta de Lifty (conductor y, si tenés, pasajero). Se eliminan
              datos personales, documentos y tokens. Viajes y montos pueden quedar anonimizados por
              obligaciones legales o antifraude.
            </Text>
            <Text style={styles.body}>
              No prometemos borrar backups históricos al instante. Si tenés un viaje activo, primero
              terminarlo o cancelarlo.
            </Text>
            <Button
              title="Continuar"
              variant="danger"
              onPress={() => setStep('reauth')}
              style={styles.btn}
              textStyle={{ color: theme.colors.dangerRed }}
            />
            <Button title="Cancelar" variant="secondary" onPress={() => navigation.goBack()} />
          </Card>
        ) : null}

        {step === 'reauth' ? (
          <Card>
            <Text style={styles.warnTitle}>Confirmá que sos vos</Text>
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
                  title={loading ? 'Eliminando…' : 'Verificar y eliminar'}
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
                title={loading ? 'Eliminando…' : 'Verificar con Google y eliminar'}
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
                No detectamos un método de reautenticación. Escribinos a soporte.
              </Text>
            ) : null}
            {loading ? (
              <ActivityIndicator color={theme.colors.dangerRed} style={{ marginTop: 8 }} />
            ) : null}
          </Card>
        ) : null}

        {step === 'done' ? (
          <Card>
            <Ionicons name="checkmark-circle" size={48} color={theme.colors.turquoise} />
            <Text style={styles.warnTitle}>Solicitud registrada</Text>
            <Text style={styles.body}>
              Empezamos a eliminar tu cuenta. Vas a recibir un email cuando termine. Ya cerramos la
              sesión en este dispositivo.
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
          <Text style={styles.footerNote}>
            ¿Problemas? Escribinos a admin@liftyviajes.com — no borramos cuentas de lab principales
            sin OK.
          </Text>
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
