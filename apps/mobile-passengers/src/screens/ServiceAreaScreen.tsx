import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandSplash } from '../components/BrandSplash';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  SERVICE_AREA_BODY,
  SERVICE_AREA_CTA,
  SERVICE_AREA_HINT,
  SERVICE_AREA_LABEL,
  SERVICE_AREA_TITLE,
} from '../lib/serviceArea';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

/**
 * One-shot post-signup notice: launch coverage is Villa Dolores only.
 * Mobile-first: scrollable body + sticky CTA so "Entendido" never clips.
 * Next step = location permission (same path as email signup).
 * Auth-only — guests never see this before Welcome.
 */
export function ServiceAreaScreen() {
  const { replace } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setCoverageNoticeSeen = useAuthStore((s) => s.setCoverageNoticeSeen);

  useEffect(() => {
    if (!sessionRestored) return;
    if (!isAuthenticated) {
      replace('/');
    }
  }, [sessionRestored, isAuthenticated, replace]);

  const handleContinue = () => {
    if (!useAuthStore.getState().isAuthenticated) {
      replace('/');
      return;
    }
    setCoverageNoticeSeen(true);
    replace('LocationPermissions');
  };

  // Boot / guest: brand only until Welcome (never flash Villa Dolores cartel).
  if (!sessionRestored || !isAuthenticated) {
    return <BrandSplash />;
  }

  const bottomPad = Math.max(insets.bottom, theme.spacing.sm) + theme.spacing.md;

  return (
    <View style={[styles.safe, { paddingTop: insets.top + theme.spacing.sm }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.inner}>
          <View style={styles.iconWell}>
            <Ionicons name="location" size={32} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>{SERVICE_AREA_TITLE}</Text>
          <Text style={styles.subtitle}>{SERVICE_AREA_BODY}</Text>

          <View style={styles.chip}>
            <Ionicons name="navigate-circle-outline" size={18} color={theme.colors.deepBlue} />
            <Text style={styles.chipText}>{SERVICE_AREA_LABEL}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoItem}>• Pedí el viaje con origen y destino en esa zona</Text>
            <Text style={styles.infoItem}>• Fuera de cobertura puede no haber conductores</Text>
            <Text style={styles.infoItem}>• El GPS del teléfono no cambia la zona de servicio</Text>
          </View>

          <Text style={styles.hint}>{SERVICE_AREA_HINT}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        <Button variant="cta" onPress={handleContinue} style={styles.button}>
          {SERVICE_AREA_CTA}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconWell: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.85,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.surfaceMuted,
    marginTop: theme.spacing.xs,
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  infoCard: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.surfaceMuted,
    marginTop: theme.spacing.xs,
  },
  infoItem: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    lineHeight: 20,
  },
  hint: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  footer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(13, 43, 69, 0.08)',
    backgroundColor: theme.colors.background,
  },
  button: {
    width: '100%',
  },
});
