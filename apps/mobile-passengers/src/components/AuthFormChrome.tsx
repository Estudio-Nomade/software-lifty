import type React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

type AuthFormChromeProps = {
  brand?: string;
  title: string;
  subtitle?: string;
  /** Optional progress (e.g. passenger multi-step feel) */
  step?: number;
  total?: number;
};

/**
 * Shared left-aligned auth/onboarding header for passenger register.
 * Same visual language as driver OnboardingChrome, without step coupling.
 */
export function AuthFormChrome({
  brand = 'Lifty',
  title,
  subtitle,
  step,
  total = 2,
}: AuthFormChromeProps) {
  const showProgress = typeof step === 'number' && total > 0;
  const clamped = showProgress ? Math.max(1, Math.min(step!, total)) : 0;

  return (
    <View style={styles.wrap}>
      {showProgress ? (
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
      ) : null}

      <Text style={styles.brand}>{brand}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type AuthFormCardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function AuthFormCard({ children, style }: AuthFormCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
  brand: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
});
