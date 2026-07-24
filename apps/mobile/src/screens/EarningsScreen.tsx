import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { Card } from '../components/Card';
import { TabBar, type TabKey } from '../components/TabBar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

export const EarningsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const [activeTab, setActiveTab] = React.useState<TabKey>('earnings');

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

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const retentionTotal = earnings?.trips?.reduce((sum, t) => sum + (t.platform_fee ?? 0), 0) ?? 0;

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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Cobros</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                <Text style={styles.rowLabel}>💵 Efectivo</Text>
                <Text style={styles.rowValue}>{formatCurrency(earnings.cash)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>🏦 Transferencia</Text>
                <Text style={[styles.rowValue, { color: theme.colors.turquoise }]}>
                  {formatCurrency(earnings.transfer)}
                </Text>
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
              {retentionTotal > 0 && (
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: theme.colors.dangerRed }]}>
                    Retencion Lifty
                  </Text>
                  <Text style={[styles.rowValue, { color: theme.colors.dangerRed }]}>
                    -{formatCurrency(retentionTotal)}
                  </Text>
                </View>
              )}
              {earnings.platform_debt ? (
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: theme.colors.dangerRed }]}>
                    Deuda pendiente
                  </Text>
                  <Text style={[styles.rowValue, { color: theme.colors.dangerRed }]}>
                    -{formatCurrency(earnings.platform_debt)}
                  </Text>
                </View>
              ) : null}
            </Card>

            <Card>
              <TouchableOpacity
                style={styles.withdrawRow}
                onPress={() => navigation.navigate('Withdraw')}
              >
                <Text style={styles.withdrawLabel}>Retirar saldo</Text>
                <Text style={styles.changeLink}>Retirar →</Text>
              </TouchableOpacity>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Tus ganancias</Text>
              <View style={styles.earningRow}>
                <Text style={styles.earningLabel}>Ayer</Text>
                <Text style={styles.earningAmount}>{formatCurrency(earnings.yesterday ?? 0)}</Text>
              </View>
              <View style={styles.earningRow}>
                <Text style={styles.earningLabel}>Esta semana</Text>
                <Text style={styles.earningAmount}>{formatCurrency(earnings.week ?? 0)}</Text>
              </View>
            </Card>

            {earnings.trips && earnings.trips.length > 0 && (
              <>
                <Card>
                  <Text style={styles.cardTitle}>Viajes de hoy</Text>
                  {earnings.trips.map((trip) => (
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
                          Retencion -{formatCurrency(trip.platform_fee ?? 0)}
                        </Text>
                        <Text style={styles.tripNet}>
                          Recibis {formatCurrency(trip.driver_earnings ?? 0)}
                        </Text>
                      </View>
                    </View>
                  ))}
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

            <Card>
              <Text style={styles.cardTitle}>Tus ganancias</Text>
              <View style={styles.earningRow}>
                <Text style={styles.earningLabel}>Ayer</Text>
                <Text style={styles.earningAmount}>{formatCurrency(earnings?.yesterday ?? 0)}</Text>
              </View>
              <View style={styles.earningRow}>
                <Text style={styles.earningLabel}>Esta semana</Text>
                <Text style={styles.earningAmount}>{formatCurrency(earnings?.week ?? 0)}</Text>
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

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
  },
  header: {
    height: 56,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  headerTitle: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  totalCard: {
    width: 343,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  totalLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
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
    backgroundColor: theme.colors.lightGray,
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
  withdrawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  withdrawLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  errorSection: {
    width: 343,
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
});
