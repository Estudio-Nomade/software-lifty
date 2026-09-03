import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const FEE_ARS = 600;

interface CancellationMetrics {
  tvf_rate_pct: number | null;
  tvf_completed: number;
  tvf_cancels: number;
  period_days: number;
  total_cancels: number;
  driver_cancels: number;
  no_shows: number;
  payouts_pending_ars: number;
  payouts_paid_ars: number;
  platform_debt: number;
  debt_cap_ars: number;
  debt_remaining_ars: number;
  commission_active: boolean;
}

function tvfTone(pct: number): string {
  if (pct < 50) return theme.colors.dangerRed;
  if (pct < 70) return theme.colors.amber;
  return theme.colors.success;
}

function tvfStatusLabel(pct: number): string {
  if (pct < 50) return 'En riesgo';
  if (pct < 70) return 'Cuidado';
  return 'En regla';
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SITUATIONS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'navigate',
    title: 'Vas en camino',
    body: 'Si cancelás, no hay multa, pero sí cuenta para el TVF.',
  },
  {
    icon: 'time-outline',
    title: 'Llegaste y esperás',
    body: 'Los primeros 5 minutos no podés cancelar. Después podés marcar no-show. Cobrás $600 y no te baja el TVF.',
  },
  {
    icon: 'person-outline',
    title: 'El pasajero cancela',
    body: 'Si ya pasaron 2 minutos desde que aceptaste, o si ya llegaste, cobrás $600. No te baja el TVF.',
  },
  {
    icon: 'car-sport-outline',
    title: 'Viaje en curso',
    body: 'Nadie puede cancelar.',
  },
];

const THRESHOLDS: { title: string; body: string; color: string }[] = [
  {
    title: '70% o más',
    body: 'Tu cuenta está en regla. Recibís viajes con normalidad.',
    color: theme.colors.success,
  },
  {
    title: 'Menos de 70%',
    body: 'Te mandamos un aviso. Si sigue bajando, tu cuenta puede ir a revisión.',
    color: theme.colors.amber,
  },
  {
    title: 'Menos de 50%',
    body: 'Dejás de recibir ofertas hasta que soporte revise tu cuenta.',
    color: theme.colors.dangerRed,
  },
];

export const CancellationPolicyScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [metrics, setMetrics] = useState<CancellationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await apiClient.get('/drivers/me/cancellation-metrics');
      setMetrics(res.data?.data ?? res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const renderHero = () => {
    if (loading) {
      return (
        <Card style={styles.heroCard}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </Card>
      );
    }

    if (error || !metrics) {
      return (
        <Card style={styles.heroCard}>
          <Text style={styles.errorText}>No pudimos cargar tus números</Text>
          <Button
            title="REINTENTAR"
            variant="outline"
            onPress={fetchMetrics}
            style={styles.fullWidth}
          />
        </Card>
      );
    }

    const denominator = metrics.tvf_completed + metrics.tvf_cancels;
    const hasSample = metrics.tvf_rate_pct != null && denominator > 0;

    if (!hasSample) {
      return (
        <Card style={styles.heroCard}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>TVF</Text>
          </View>
          <Text style={[styles.heroPct, { color: theme.colors.mediumGray }]}>—</Text>
          <Text style={styles.heroCaption}>Tasa de Viajes Finalizados</Text>
          <Text style={styles.heroFormula}>
            Todavía no hay viajes que cuenten. El TVF aparece cuando completes o canceles un viaje
            que sume a la tasa.
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: '0%', backgroundColor: theme.colors.mediumGray },
              ]}
            />
          </View>
          <View style={[styles.statusBadge, { backgroundColor: theme.colors.mediumGray }]}>
            <Text style={styles.statusBadgeText}>Sin datos</Text>
          </View>
        </Card>
      );
    }

    const pct = metrics.tvf_rate_pct as number;
    const tone = tvfTone(pct);
    const fill = Math.max(0, Math.min(100, pct));
    const statusLabel = tvfStatusLabel(pct);

    return (
      <Card style={styles.heroCard}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>TVF</Text>
        </View>
        <Text style={[styles.heroPct, { color: tone }]}>{pct.toFixed(1)}%</Text>
        <Text style={styles.heroCaption}>Tasa de Viajes Finalizados</Text>
        <Text style={styles.heroFormula}>
          Completaste {metrics.tvf_completed} viajes y cancelaste {metrics.tvf_cancels} que cuentan.
          TVF = viajes completados ÷ (completados + esas cancelaciones).
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${fill}%`, backgroundColor: tone }]} />
        </View>
        <View style={[styles.statusBadge, { backgroundColor: tone }]}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Cancelaciones" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHero()}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>¿Qué es el TVF?</Text>
          <Text style={styles.body}>
            El TVF es tu <Text style={styles.bodyBold}>Tasa de Viajes Finalizados</Text>. Mide
            cuántos viajes terminás versus cuántos cancelás vos.
          </Text>
          <Text style={styles.body}>
            Solo bajan el TVF las cancelaciones que <Text style={styles.bodyBold}>hiciste vos</Text>{' '}
            cuando ya habías aceptado y ibas en camino.
          </Text>
          <Text style={styles.body}>
            No baja el TVF si el pasajero cancela, si no aparece después de 5 minutos, o si se corta
            la búsqueda.
          </Text>
          <View style={styles.ruleRow}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
            <Text style={styles.ruleText}>
              Pasajero cancela o no se presenta → no te baja el TVF
            </Text>
          </View>
          <View style={styles.ruleRow}>
            <Ionicons name="close-circle" size={20} color={theme.colors.dangerRed} />
            <Text style={styles.ruleText}>Si cancelás vos en camino → sí cuenta</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>¿Cuándo te afecta?</Text>
          {SITUATIONS.map((situation, index) => (
            <View
              key={situation.title}
              style={[styles.situationRow, index > 0 && styles.situationRowBorder]}
            >
              <Ionicons name={situation.icon} size={20} color={theme.colors.turquoise} />
              <View style={styles.situationBody}>
                <Text style={styles.situationTitle}>{situation.title}</Text>
                <Text style={styles.body}>{situation.body}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Plata</Text>
          <Text style={styles.moneyAmount}>${FEE_ARS}</Text>
          <Text style={styles.body}>
            Cuando el pasajero cancela tarde o no se presenta, te corresponde ${FEE_ARS}.
          </Text>
          <Text style={styles.body}>
            Lifty te los transfiere. Aparecen en esta pantalla como "Se te debe" hasta que se
            paguen.
          </Text>
          <Text style={styles.body}>
            Si cancelás vos en camino, no hay multa ni cobro. Solo impacta el TVF.
          </Text>
          {metrics && metrics.payouts_pending_ars > 0 ? (
            <View style={styles.payoutBanner}>
              <Ionicons name="cash-outline" size={20} color={theme.colors.turquoise} />
              <Text style={styles.payoutBannerText}>
                Lifty te debe ${metrics.payouts_pending_ars}. Te lo transferimos.
              </Text>
            </View>
          ) : null}
          {metrics?.commission_active && metrics.platform_debt > 0 ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Deuda con Lifty</Text>
              <Text style={styles.infoValue}>
                ${metrics.platform_debt} / ${metrics.debt_cap_ars}
              </Text>
            </View>
          ) : null}
          {metrics?.commission_active && metrics.debt_remaining_ars === 0 ? (
            <Text style={styles.debtWarning}>
              Alcanzaste el tope. Regularizá tu saldo o cobrá por transferencia.
            </Text>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Umbrales</Text>
          {THRESHOLDS.map((threshold, index) => (
            <View key={threshold.title} style={styles.stepRow}>
              <View style={styles.stepIndicator}>
                <View style={[styles.stepDot, { backgroundColor: threshold.color }]} />
                {index < THRESHOLDS.length - 1 ? <View style={styles.stepLine} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{threshold.title}</Text>
                <Text style={styles.body}>{threshold.body}</Text>
              </View>
            </View>
          ))}
        </Card>

        <View style={styles.ctaContainer}>
          <Button
            title="ENTENDIDO"
            variant="primary"
            onPress={() => navigation.goBack()}
            style={styles.fullWidth}
          />
          <Button
            title="VER HISTORIAL"
            variant="outline"
            onPress={() => navigation.navigate('TripHistory')}
            style={styles.fullWidth}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    paddingBottom: theme.dimensions.tabBarHeight + theme.spacing['2xl'],
  },
  card: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  heroCard: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  pill: {
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  pillText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  heroPct: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
  },
  heroCaption: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  heroFormula: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: theme.radius.full,
  },
  statusBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  statusBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  cardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  bodyBold: {
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  ruleText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 20,
  },
  situationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  situationRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  situationBody: {
    flex: 1,
    gap: 2,
  },
  situationTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  moneyAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  payoutBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  payoutBannerText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  infoValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  debtWarning: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    fontWeight: theme.fontWeight.medium,
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepIndicator: {
    alignItems: 'center',
    width: 16,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.full,
  },
  stepLine: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.lightGray,
  },
  stepBody: {
    flex: 1,
    gap: 2,
    paddingBottom: theme.spacing.md,
  },
  stepTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  ctaContainer: {
    gap: theme.spacing.sm,
  },
});
