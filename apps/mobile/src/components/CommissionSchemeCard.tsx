import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CommissionScheme } from '../lib/commission';
import { formatRatePctPlain, isZeroCommissionPhase } from '../lib/commission';
import { theme } from '../theme';
import { Card } from './Card';
import { Text } from './ui/Text';

type Props = {
  scheme: CommissionScheme;
  /** Prefer daily API commission.rate_pct when present. */
  ratePctOverride?: number | null;
};

export const CommissionSchemeCard: React.FC<Props> = ({ scheme, ratePctOverride }) => {
  const ratePct =
    ratePctOverride != null && Number.isFinite(ratePctOverride)
      ? ratePctOverride
      : scheme.current.rate_pct;
  const zero = isZeroCommissionPhase({ rate: ratePct / 100, rate_pct: ratePct });
  const n = formatRatePctPlain(ratePct);
  const keep = formatRatePctPlain(100 - ratePct);

  return (
    <View style={styles.wrap}>
      <Card style={styles.heroCard} padding={theme.spacing.lg}>
        <Text style={styles.heroEyebrow}>Tu comisión actual</Text>
        <Text
          style={[styles.heroRate, zero ? styles.heroRateZero : null]}
          accessibilityRole="header"
        >
          {n}%
        </Text>
        <Text style={styles.heroSub}>Por cada viaje completado</Text>

        <View style={styles.keepBlock}>
          <Text style={styles.keepLabel}>Tus ganancias</Text>
          <Text style={styles.keepValue}>{keep}% de la tarifa restante</Text>
        </View>

        <View style={styles.footnoteRow}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.mediumGray} />
          <Text style={styles.footnote}>
            {scheme.footnote?.trim() || 'La comisión se descuenta automáticamente de cada viaje.'}
          </Text>
        </View>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.md,
    width: '100%',
  },
  heroCard: {
    width: '100%',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    borderColor: theme.colors.turquoise,
    borderWidth: 1,
  },
  heroEyebrow: {
    ...theme.fontStyles.label,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroRate: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    lineHeight: 40,
  },
  heroRateZero: {
    color: theme.colors.turquoise,
  },
  heroSub: {
    ...theme.fontStyles.body,
    color: theme.colors.mediumGray,
  },
  keepBlock: {
    marginTop: theme.spacing.md,
    gap: 2,
  },
  keepLabel: {
    ...theme.fontStyles.label,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  keepValue: {
    ...theme.fontStyles.body,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
  },
  footnote: {
    ...theme.fontStyles.caption,
    color: theme.colors.mediumGray,
    flex: 1,
  },
});
