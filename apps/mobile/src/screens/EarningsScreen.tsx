import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Text } from '../components/ui/Text';
import { useTabBar } from '../context/TabBarContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTabBarScrollVisibility } from '../hooks/useTabBarScrollVisibility';
import {
  formatCommissionBanner,
  formatDebtCapLabel,
  isZeroCommissionPhase,
  normalizePlatformDebt,
  shouldShowPlatformDebt,
} from '../lib/commission';
import { getTabBarReserve } from '../lib/tabBarLayout';
import { theme } from '../theme';

export const EarningsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { setActiveTab } = useTabBar();
  const insets = useSafeAreaInsets();
  const { onScroll } = useTabBarScrollVisibility();
  const contentPadBottom = getTabBarReserve(insets.bottom) + theme.spacing['2xl'];

  const {
    data: earnings,
    isLoading,
    error,
    refetch,
  } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/earnings/daily');
      return response.data.data ?? response.data;
    },
    refetchInterval: 60_000,
  });

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const retentionTotal = earnings?.trips?.reduce((sum, t) => sum + (t.platform_fee ?? 0), 0) ?? 0;
  const tripsRevenueTotal = earnings?.trips?.reduce((sum, t) => sum + (t.total_fare ?? 0), 0) ?? 0;
  // Prefer admin global phase rate. Realized % only when there were fares today —
  // never invent 0% from an empty day when the server rate is unknown/missing.
  const serverRatePct =
    earnings?.commission != null && Number.isFinite(earnings.commission.rate_pct)
      ? Math.round(earnings.commission.rate_pct)
      : null;
  const realizedRetentionPercent =
    tripsRevenueTotal > 0 ? Math.round((retentionTotal / tripsRevenueTotal) * 100) : null;
  const retentionPercent = serverRatePct ?? realizedRetentionPercent;
  const retentionPercentLabel = retentionPercent == null ? '' : ` (${retentionPercent}%)`;
  const commissionBanner =
    earnings?.commission != null ? formatCommissionBanner(earnings.commission) : null;
  const commissionIsZero = isZeroCommissionPhase(earnings?.commission);

  const weekRetention = earnings?.week_platform_fee ?? 0;
  const weekFare = earnings?.week_total_fare ?? 0;
  const weekRetentionPercent = weekFare > 0 ? Math.round((weekRetention / weekFare) * 100) : null;
  const weekRetentionPercentLabel =
    weekRetentionPercent != null
      ? ` (${weekRetentionPercent}%)`
      : serverRatePct != null
        ? ` (${serverRatePct}%)`
        : '';

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const shortAddress = (address: string) => {
    const parts = address.split(',');
    return parts.length > 1 ? parts[0].trim() : address;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Cobros" showBack={false} variant="light" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <View style={styles.errorSection}>
            <Card style={styles.errorCard} padding={theme.spacing.lg}>
              <Text style={styles.errorText}>No se pudo cargar</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </Card>
          </View>
        ) : earnings && earnings.total > 0 ? (
          <>
            <Card style={styles.totalCard} padding={theme.spacing.lg}>
              <Text style={styles.totalLabel}>Ganaste hoy</Text>
              <Text style={styles.totalAmount}>{formatCurrency(earnings.total)}</Text>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Desglose de hoy</Text>

              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="cash-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Efectivo</Text>
                </View>
                <Text style={styles.rowValue}>{formatCurrency(earnings.cash)}</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="card-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Transferencia</Text>
                </View>
                <Text style={styles.rowValue}>{formatCurrency(earnings.transfer)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontWeight: theme.fontWeight.bold }]}>
                  Total hoy
                </Text>
                <Text style={[styles.rowValue, { fontWeight: theme.fontWeight.bold }]}>
                  {formatCurrency(earnings.total)}
                </Text>
              </View>
              {shouldShowPlatformDebt(earnings.platform_debt, {
                debtBlocksOnline: earnings.debt_blocks_online,
              }) ? (
                <>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: theme.colors.dangerRed }]}>
                        Deuda pendiente
                      </Text>
                      {formatDebtCapLabel(earnings.debt_cap_ars) ? (
                        <Text
                          style={[
                            styles.rowLabel,
                            {
                              color: theme.colors.mediumGray,
                              fontSize: theme.fontSize.sm,
                            },
                          ]}
                        >
                          {formatDebtCapLabel(earnings.debt_cap_ars)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.rowValue, { color: theme.colors.dangerRed }]}>
                      -{formatCurrency(normalizePlatformDebt(earnings.platform_debt))}
                    </Text>
                  </View>
                  {earnings.debt_blocks_online === true ? (
                    <View style={styles.debtBlockBanner}>
                      <Text style={styles.debtBlockBannerText}>
                        No podés conectarte hasta regularizar la deuda de comisión. Transferí el
                        total a Lifty y subí el comprobante.
                      </Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.payDebtBtn}
                    onPress={() => navigation.navigate('PayCommissionDebt')}
                    accessibilityRole="button"
                    accessibilityLabel="Pagar comisión a Lifty"
                    activeOpacity={0.85}
                  >
                    <Ionicons name="card-outline" size={18} color={theme.colors.white} />
                    <Text style={styles.payDebtBtnText}>Pagar comisión</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </Card>

            {!shouldShowPlatformDebt(earnings.platform_debt, {
              debtBlocksOnline: earnings.debt_blocks_online,
            }) ? (
              <TouchableOpacity
                style={styles.commissionEntryCard}
                onPress={() => navigation.navigate('PayCommissionDebt')}
                accessibilityRole="button"
                accessibilityLabel="Ver comprobantes enviados a Lifty"
                activeOpacity={0.7}
              >
                <View style={styles.commissionEntryIcon}>
                  <Ionicons name="receipt-outline" size={20} color={theme.colors.turquoise} />
                </View>
                <View style={styles.commissionEntryBody}>
                  <Text style={styles.commissionEntryTitle}>Comprobantes a Lifty</Text>
                  <Text style={styles.commissionEntrySub}>Historial de pagos de comisión</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
              </TouchableOpacity>
            ) : null}

            <Card>
              <Text style={styles.cardTitle}>Tus ganancias</Text>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="person-outline" size={16} color={theme.colors.turquoise} />
                  <Text style={styles.rowLabel}>Para vos</Text>
                </View>
                <Text style={[styles.rowValue, { color: theme.colors.turquoise }]}>
                  {formatCurrency(earnings.total)}
                </Text>
              </View>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="business-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Comision Lifty</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    {
                      color: retentionTotal > 0 ? theme.colors.dangerRed : theme.colors.mediumGray,
                    },
                  ]}
                >
                  -{formatCurrency(retentionTotal)}
                  {retentionPercentLabel}
                </Text>
              </View>
              {commissionBanner ? (
                <View style={styles.exemptNotice}>
                  <Ionicons
                    name={
                      commissionIsZero ? 'checkmark-circle-outline' : 'information-circle-outline'
                    }
                    size={16}
                    color={commissionIsZero ? theme.colors.turquoise : theme.colors.mediumGray}
                  />
                  <Text style={styles.exemptNoticeText}>{commissionBanner}</Text>
                </View>
              ) : null}
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Esta semana</Text>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="person-outline" size={16} color={theme.colors.turquoise} />
                  <Text style={styles.rowLabel}>Para vos</Text>
                </View>
                <Text style={[styles.rowValue, { color: theme.colors.turquoise }]}>
                  {formatCurrency(earnings.week ?? 0)}
                </Text>
              </View>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="business-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Comision Lifty</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    {
                      color: weekRetention > 0 ? theme.colors.dangerRed : theme.colors.mediumGray,
                    },
                  ]}
                >
                  -{formatCurrency(weekRetention)}
                  {weekRetentionPercentLabel}
                </Text>
              </View>
            </Card>

            {earnings.trips && earnings.trips.length > 0 && (
              <>
                <Card>
                  <Text style={styles.cardTitle}>Viajes de hoy</Text>
                  {earnings.trips.map((trip) => {
                    const tripRetentionPercent =
                      trip.total_fare && trip.total_fare > 0
                        ? Math.round(((trip.platform_fee ?? 0) / trip.total_fare) * 100)
                        : 0;
                    return (
                      <View key={trip.id} style={styles.tripRow}>
                        <View style={styles.tripLeft}>
                          <Text style={styles.tripTime}>{formatTime(trip.created_at)}</Text>
                          <Text style={styles.tripOrigin} numberOfLines={1}>
                            {shortAddress(trip.origin_address ?? '')}
                          </Text>
                        </View>
                        <View style={styles.tripRight}>
                          <Text style={styles.tripAmount}>
                            {formatCurrency(trip.total_fare ?? 0)}
                          </Text>
                          <Text style={styles.tripRetention}>
                            Retencion ({tripRetentionPercent}%) -
                            {formatCurrency(trip.platform_fee ?? 0)}
                          </Text>
                          <Text style={styles.tripNet}>
                            Recibis {formatCurrency(trip.driver_earnings ?? 0)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
                <TouchableOpacity
                  style={styles.historyLink}
                  onPress={() => navigation.navigate('TripHistory')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.historyLinkText}>Ver historial completo →</Text>
                </TouchableOpacity>
              </>
            )}

            <Card>
              <Text style={styles.cardTitle}>Metodo de cobro</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('PaymentMethod')}
              >
                <Text style={styles.cvuText}>Administrar metodos de pago</Text>
                <Text style={styles.changeLink}>Cambiar →</Text>
              </TouchableOpacity>
            </Card>
          </>
        ) : (
          <>
            <Card style={styles.totalCard} padding={theme.spacing.lg}>
              <Text style={styles.totalLabel}>Ganaste hoy</Text>
              <Text style={[styles.totalAmount, { color: theme.colors.mediumGray }]}>$0</Text>
              <Text style={styles.emptySubtext}>Todavia no registras ganancias</Text>
            </Card>

            {earnings &&
            shouldShowPlatformDebt(earnings.platform_debt, {
              debtBlocksOnline: earnings.debt_blocks_online,
            }) ? (
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: theme.colors.dangerRed }]}>
                      Deuda pendiente
                    </Text>
                    {formatDebtCapLabel(earnings.debt_cap_ars) ? (
                      <Text
                        style={[
                          styles.rowLabel,
                          {
                            color: theme.colors.mediumGray,
                            fontSize: theme.fontSize.sm,
                          },
                        ]}
                      >
                        {formatDebtCapLabel(earnings.debt_cap_ars)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.rowValue, { color: theme.colors.dangerRed }]}>
                    -{formatCurrency(normalizePlatformDebt(earnings.platform_debt))}
                  </Text>
                </View>
                {earnings.debt_blocks_online === true ? (
                  <View style={styles.debtBlockBanner}>
                    <Text style={styles.debtBlockBannerText}>
                      No podés conectarte hasta regularizar la deuda de comisión. Transferí el total
                      a Lifty y subí el comprobante.
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.payDebtBtn}
                  onPress={() => navigation.navigate('PayCommissionDebt')}
                  accessibilityRole="button"
                  accessibilityLabel="Pagar comisión a Lifty"
                  activeOpacity={0.85}
                >
                  <Ionicons name="card-outline" size={18} color={theme.colors.white} />
                  <Text style={styles.payDebtBtnText}>Pagar comisión</Text>
                </TouchableOpacity>
              </Card>
            ) : (
              <TouchableOpacity
                style={styles.commissionEntryCard}
                onPress={() => navigation.navigate('PayCommissionDebt')}
                accessibilityRole="button"
                accessibilityLabel="Ver comprobantes enviados a Lifty"
                activeOpacity={0.7}
              >
                <View style={styles.commissionEntryIcon}>
                  <Ionicons name="receipt-outline" size={20} color={theme.colors.turquoise} />
                </View>
                <View style={styles.commissionEntryBody}>
                  <Text style={styles.commissionEntryTitle}>Comprobantes a Lifty</Text>
                  <Text style={styles.commissionEntrySub}>Historial de pagos de comisión</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
              </TouchableOpacity>
            )}

            <Card>
              <Text style={styles.cardTitle}>Tus ganancias</Text>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="person-outline" size={16} color={theme.colors.turquoise} />
                  <Text style={styles.rowLabel}>Para vos</Text>
                </View>
                <Text style={[styles.rowValue, { color: theme.colors.turquoise }]}>
                  {formatCurrency(earnings?.total ?? 0)}
                </Text>
              </View>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="business-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Comision Lifty</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    {
                      color: retentionTotal > 0 ? theme.colors.dangerRed : theme.colors.mediumGray,
                    },
                  ]}
                >
                  -{formatCurrency(retentionTotal)}
                  {retentionPercentLabel}
                </Text>
              </View>
              {commissionBanner ? (
                <View style={styles.exemptNotice}>
                  <Ionicons
                    name={
                      commissionIsZero ? 'checkmark-circle-outline' : 'information-circle-outline'
                    }
                    size={16}
                    color={commissionIsZero ? theme.colors.turquoise : theme.colors.mediumGray}
                  />
                  <Text style={styles.exemptNoticeText}>{commissionBanner}</Text>
                </View>
              ) : null}
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Esta semana</Text>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="person-outline" size={16} color={theme.colors.turquoise} />
                  <Text style={styles.rowLabel}>Para vos</Text>
                </View>
                <Text style={[styles.rowValue, { color: theme.colors.turquoise }]}>
                  {formatCurrency(earnings?.week ?? 0)}
                </Text>
              </View>
              <View style={styles.row}>
                <View style={styles.rowLabelContainer}>
                  <Ionicons name="business-outline" size={16} color={theme.colors.mediumGray} />
                  <Text style={styles.rowLabel}>Comision Lifty</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    {
                      color: weekRetention > 0 ? theme.colors.dangerRed : theme.colors.mediumGray,
                    },
                  ]}
                >
                  -{formatCurrency(weekRetention)}
                  {weekRetentionPercentLabel}
                </Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Metodo de cobro</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('PaymentMethod')}
              >
                <Text style={styles.cvuText}>Administrar metodos de pago</Text>
                <Text style={styles.changeLink}>Cambiar →</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
  },
  content: {
    alignItems: 'stretch',
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  totalCard: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  totalLabel: {
    ...theme.fontStyles.label,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
  },
  emptySubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginTop: 4,
  },
  cardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.mediumGray,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  rowValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.surfaceMuted,
    marginVertical: theme.spacing.xs,
  },
  earningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  earningLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  earningAmount: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  tripLeft: {
    flex: 1,
    gap: 2,
  },
  tripTime: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  tripOrigin: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    width: 200,
  },
  tripRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tripAmount: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  tripPayment: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  tripRetention: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    fontWeight: theme.fontWeight.medium,
  },
  tripNet: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  cvuText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  changeLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  exemptNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  exemptNoticeText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 18,
  },
  errorSection: {
    width: '100%',
    gap: theme.spacing.md,
  },
  errorCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  historyLink: {
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  historyLinkText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  debtBlockBanner: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  debtBlockBannerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 18,
  },
  payDebtBtn: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.buttonRadius,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  payDebtBtnText: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.md,
  },
  commissionEntryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  commissionEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commissionEntryBody: {
    flex: 1,
    gap: 2,
  },
  commissionEntryTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  commissionEntrySub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
});
