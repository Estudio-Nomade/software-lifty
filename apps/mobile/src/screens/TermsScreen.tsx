import type React from 'react';
import { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { resolvePostAuthRoute } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const TermsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const setTermsAccepted = useAuthStore((s) => s.setTermsAccepted);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      setTermsAccepted(true);
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al verificar tu cuenta';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar
        title="Terminos y Condiciones"
        onBack={() => navigation.goBack()}
        backgroundColor={theme.colors.deepBlue}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>TERMINOS Y CONDICIONES</Text>
        <Text style={styles.subtitle}>Ultima actualizacion: Junio 2024</Text>

        <Text style={styles.heading}>1. Relacion Contractual</Text>
        <Text style={styles.body}>
          Al utilizar la aplicacion Lifty, aceptas estos terminos y condiciones. Lifty actua como
          intermediario entre conductores y pasajeros. No somos una empresa de transporte.
        </Text>

        <Text style={styles.heading}>2. Verificacion de Identidad</Text>
        <Text style={styles.body}>
          Todos los conductores deben completar el proceso de verificacion de identidad mediante
          DIDIT. Debes proporcionar documentacion valida y mantener tus datos actualizados.
        </Text>

        <Text style={styles.heading}>3. Comision</Text>
        <Text style={styles.body}>
          Lifty cobra una comision del 10% sobre cada viaje completado. Esta comision se descuenta
          automaticamente al finalizar cada viaje.
        </Text>

        <Text style={styles.heading}>4. Cancelaciones</Text>
        <Text style={styles.body}>
          Si cancelas un viaje antes de los 5 minutos de espera, tu tasa de finalizacion se vera
          afectada. Despues de los 5 minutos, recibiras una compensacion por el tiempo de espera.
        </Text>

        <Text style={styles.heading}>5. Privacidad</Text>
        <Text style={styles.body}>
          Tus datos personales son tratados de acuerdo a nuestra Politica de Privacidad. No
          compartimos tu informacion con terceros sin tu consentimiento explicito.
        </Text>

        <View style={{ height: 48 }} />
      </ScrollView>
      <View style={styles.footer}>
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
        <Button
          title={loading ? '' : 'ACEPTAR Y CONTINUAR'}
          onPress={handleAccept}
          loading={loading}
          disabled={loading}
          style={styles.button}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.lg,
  },
  heading: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  button: {
    width: 327,
  },
});
