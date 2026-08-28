import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { requestFreshPosition } from '../hooks/useLocation';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';

export function LocationPermissionsScreen() {
  const { replace } = useAppNavigation();
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        // Browser prompt is tied to getCurrentPosition / watch — seed immediately.
        const fix = await requestFreshPosition();
        setPermissionGranted(Boolean(fix));
        if (!fix) {
          setError(
            useLocationStore.getState().locationError ??
              'No se pudo obtener la ubicación. Podés reintentar desde el mapa.',
          );
          setLoading(false);
          // Still enter Home so locate/retry works.
          replace('Home');
          return;
        }
        replace('Home');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      if (granted) {
        // Seed store before Home mounts so the map is not stuck on null.
        await requestFreshPosition();
      }
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
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
        <Ionicons name="arrow-forward" size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Ionicons name="location" size={64} color={theme.colors.primary} />
        <Text style={styles.title}>¿Dónde te encontramos?</Text>
        <Text style={styles.subtitle}>
          Necesitamos tu ubicación para mostrarte el mapa, calcular rutas y conectarte con
          conductores cercanos.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoItem}>• Encontrar conductores cerca tuyo</Text>
          <Text style={styles.infoItem}>• Calcular tiempos y tarifas reales</Text>
          <Text style={styles.infoItem}>• Compartir tu viaje en vivo</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button variant="primary" onPress={handleEnable} loading={loading} style={styles.button}>
          PERMITIR UBICACIÓN
        </Button>

        <TouchableOpacity onPress={handleSkip} disabled={loading}>
          <Text style={styles.later}>Quizás después</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  skipButton: {
    position: 'absolute',
    top: theme.dimensions.statusBarHeight + theme.spacing.md,
    right: theme.spacing.lg,
    zIndex: 1,
    padding: theme.spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 24,
  },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  infoItem: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.white,
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
  later: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
