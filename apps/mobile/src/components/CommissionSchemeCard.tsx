import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CommissionScheme, CommissionSchemeStage } from '../lib/commission';
import {
  formatCommissionRateLabel,
  formatStageStatusLabel,
  isZeroCommissionPhase,
} from '../lib/commission';
import { theme } from '../theme';
import { Card } from './Card';
import { Text } from './ui/Text';

type Props = {
  scheme: CommissionScheme;
};

function statusColor(status: CommissionSchemeStage['status']): string {
  switch (status) {
    case 'current':
      return theme.colors.turquoise;
    case 'upcoming':
      return theme.colors.deepBlue;
    case 'completed':
      return theme.colors.mediumGray;
    default:
      return theme.colors.mediumGray;
  }
}

export const CommissionSchemeCard: React.FC<Props> = ({ scheme }) => {
  const zero = isZeroCommissionPhase(scheme.current);
  const rateLabel = formatCommissionRateLabel(scheme.current.rate_pct);

  return (
    <View style={styles.wrap}>
      <Card style={styles.heroCard} padding={theme.spacing.lg}>
        <Text style={styles.heroEyebrow}>Tu comisión actual</Text>
        <Text
          style={[styles.heroRate, zero ? styles.heroRateZero : null]}
          accessibilityRole="header"
        >
          {rateLabel}
        </Text>
        <Text style={styles.heroTitle}>{scheme.current.title}</Text>
        <Text style={styles.heroBlurb}>{scheme.current.blurb}</Text>
      </Card>

      <Card padding={theme.spacing.lg}>
        <Text style={styles.sectionTitle}>Esquema de comisiones</Text>
        <View style={styles.stages}>
          {scheme.stages.map((stage, index) => {
            const color = statusColor(stage.status);
            const isLast = index === scheme.stages.length - 1;
            return (
              <View key={stage.id} style={styles.stageRow}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.dot,
                      {
                        borderColor: color,
                        backgroundColor: stage.status === 'current' ? color : theme.colors.white,
                      },
                    ]}
                  />
                  {!isLast ? <View style={styles.railLine} /> : null}
                </View>
                <View style={[styles.stageBody, !isLast && styles.stageBodyGap]}>
                  <View style={styles.stageHeader}>
                    <Text
                      style={[
                        styles.stageRate,
                        stage.status === 'current' && styles.stageRateCurrent,
                        stage.status === 'completed' && styles.stageRateDone,
                      ]}
                    >
                      {formatCommissionRateLabel(stage.rate_pct)}
                    </Text>
                    <View style={[styles.badge, { borderColor: color }]}>
                      <Text style={[styles.badgeText, { color }]}>
                        {formatStageStatusLabel(stage.status)}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.stageTitle,
                      stage.status === 'completed' && styles.stageTitleDone,
                    ]}
                  >
                    {stage.title}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footnoteRow}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.mediumGray} />
          <Text style={styles.footnote}>{scheme.footnote}</Text>
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
  heroTitle: {
    ...theme.fontStyles.body,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  heroBlurb: {
    ...theme.fontStyles.body,
    color: theme.colors.mediumGray,
  },
  sectionTitle: {
    ...theme.fontStyles.subheading,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.md,
  },
  stages: {
    width: '100%',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rail: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 4,
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.lightGray,
    marginVertical: 4,
  },
  stageBody: {
    flex: 1,
    paddingBottom: theme.spacing.md,
  },
  stageBodyGap: {
    marginBottom: theme.spacing.xs,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  stageRate: {
    ...theme.fontStyles.body,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
    flexShrink: 1,
  },
  stageRateCurrent: {
    color: theme.colors.turquoise,
  },
  stageRateDone: {
    color: theme.colors.mediumGray,
  },
  badge: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  stageTitle: {
    ...theme.fontStyles.body,
    color: theme.colors.deepBlue,
    marginTop: 2,
  },
  stageTitleDone: {
    color: theme.colors.mediumGray,
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
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
