import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';

export function LocationPermissionsScreen() {
  const { replace } = useAppNavigation();
  const permissionGranted = useLocationStore((s) => s.permissionGranted);
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        setPermissionGranted(true);
        replace('Home');
      }
    });
  }, [replace, setPermissionGranted]);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionGranted(status === 'granted');
      replace('Home');
    } catch {
      setError('No se pudo solicitar el permiso. Podés activarlo después desde Configuración.');
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setPermissionGranted(false);
    replace('Home');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Activar ubicación</Text>
          <Text style={styles.body}>
            Lifty necesita tu ubicación para mostrarte conductores cerca y calcular la tarifa de tus
            viajes.
          </Text>
          <View style={styles.bullets}>
            <Text style={styles.bullet}>📍 Viajes más rápidos</Text>
            <Text style={styles.bullet}>💰 Tarifas precisas</Text>
            <Text style={styles.bullet}>🗺️ Seguimiento en tiempo real</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button variant="primary" onPress={handleEnable} loading={loading} style={styles.button}>
            ACTIVAR UBICACIÓN
          </Button>
          <Button variant="secondary" onPress={handleSkip} disabled={loading} style={styles.button}>
            AHORA NO
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.md,
  },
  bullets: {
    gap: theme.spacing.sm,
  },
  bullet: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  actions: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
  },
  button: {
    width: '100%',
  },
});
