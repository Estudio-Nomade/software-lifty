import type React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

type OnboardingChromeProps = {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  /** Optional short label above the title (e.g. "Perfil") */
  kicker?: string;
};

/**
 * Configure-surface chrome for driver onboarding.
 * Segmented progress + left-aligned hierarchy. No feature tiles, no glass.
 */
export function OnboardingChrome({
  step,
  total = 3,
  title,
  subtitle,
  kicker,
}: OnboardingChromeProps) {
  const clamped = Math.max(1, Math.min(step, total));

  return (
    <View style={styles.wrap}>
      <View style={styles.progressRow} accessibilityRole="progressbar">
        {Array.from({ length: total }, (_, i) => {
          const index = i + 1;
          const done = index < clamped;
          const active = index === clamped;
          return (
            <View
              key={index}
              style={[styles.segment, done && styles.segmentDone, active && styles.segmentActive]}
            />
          );
        })}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.stepLabel}>
          Paso {clamped} de {total}
        </Text>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type OnboardingCardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function OnboardingCard({ children, style }: OnboardingCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: theme.spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 43, 69, 0.12)',
  },
  segmentDone: {
    backgroundColor: theme.colors.primary,
  },
  segmentActive: {
    backgroundColor: theme.colors.deepBlue,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  stepLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  kicker: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    lineHeight: 22,
    maxWidth: 340,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
});
