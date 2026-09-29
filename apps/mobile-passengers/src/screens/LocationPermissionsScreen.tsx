import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { requestFreshPosition } from '../hooks/useLocation';
import { useLocationStore } from '../store/locationStore';
import { theme } from '../theme';

export function LocationPermissionsScreen() {
  const { replace } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const setPermissionGranted = useLocationStore((s) => s.setPermissionGranted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        const fix = await requestFreshPosition();
        setPermissionGranted(Boolean(fix));
        if (!fix) {
          setError(
            useLocationStore.getState().locationError ??
              'No se pudo obtener la ubicación. Podés reintentar desde el mapa.',
          );
          setLoading(false);
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
    <View style={[styles.safe, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      <TouchableOpacity onPress={handleSkip} style={styles.skipButton} hitSlop={8}>
        <Ionicons name="arrow-forward" size={22} color={theme.colors.deepBlue} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWell}>
          <Ionicons name="location" size={40} color={theme.colors.primary} />
        </View>
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

        <Button variant="cta" onPress={handleEnable} loading={loading} style={styles.button}>
          Permitir ubicación
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
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
  },
  skipButton: {
    alignSelf: 'flex-end',
    padding: theme.spacing.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  iconWell: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize['3xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    letterSpacing: -0.5,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    ...theme.shadows.card,
  },
  infoItem: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
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
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
