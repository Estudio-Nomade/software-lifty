import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';

export function LocationPermissionsScreen() {
  const { replace, goBack } = useAppNavigation();
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
      <View style={styles.content}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Text style={styles.icon}>📍</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  backButton: {
    position: 'absolute',
    top: theme.dimensions.statusBarHeight + theme.spacing.sm,
    left: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
    zIndex: 1,
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.regular,
  },
  icon: {
    fontSize: theme.fontSize['5xl'],
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
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
