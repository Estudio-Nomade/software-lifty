import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { EarningsDaily } from '../api/types';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { SideMenu } from '../components/SideMenu';
import { TabBar, type TabKey } from '../components/TabBar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

export const EarningsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const signOut = useSignOut();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const [activeTab, setActiveTab] = React.useState<TabKey>('earnings');
  const [menuVisible, setMenuVisible] = React.useState(false);

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

  const menuItems = React.useMemo(
    () => [
      {
        label: 'Inicio',
        icon: 'home-outline' as const,
        onPress: () => navigation.navigate(isOnline ? 'Active' : 'Online'),
      },
      {
        label: 'Ganancias',
        icon: 'wallet-outline' as const,
        onPress: () => {},
      },
      {
        label: 'Metodo de cobro',
        icon: 'card-outline' as const,
        onPress: () => navigation.navigate('PaymentMethod'),
      },
      {
        label: 'Perfil',
        icon: 'person-outline' as const,
        onPress: () => navigation.navigate('Profile'),
      },
      {
        label: 'Historial de viajes',
        icon: 'document-text-outline' as const,
        onPress: () => navigation.navigate('TripHistory'),
      },
      {
        label: 'Cerrar sesion',
        icon: 'log-out-outline' as const,
        onPress: () => signOut.mutate(),
        danger: true,
        dividerTop: true,
      },
    ],
    [navigation, signOut, isOnline],
  );

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const retentionTotal = earnings?.trips?.reduce((sum, t) => sum + (t.platform_fee ?? 0), 0) ?? 0;
  const tripsRevenueTotal = earnings?.trips?.reduce((sum, t) => sum + (t.total_fare ?? 0), 0) ?? 0;
  const retentionPercent =
    retentionTotal > 0 ? Math.round((retentionTotal / tripsRevenueTotal) * 100) : 0;
  const isExempt =
    earnings?.commission_exempt_until != null
      ? new Date(earnings.commission_exempt_until) > new Date()
      : false;

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
      <Navbar title="Cobros" showHamburger onHamburgerPress={() => setMenuVisible(true)} />

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
                  {retentionTotal > 0 ? ` (${retentionPercent}%)` : ' (0%)'}
                </Text>
              </View>
              {isExempt && (
                <View style={styles.exemptNotice}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={16}
                    color={theme.colors.turquoise}
                  />
                  <Text style={styles.exemptNoticeText}>
                    Comision 0% — Primer mes gratis para nuevos conductores
                  </Text>
                </View>
              )}
              <View style={styles.divider} />
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
        <Card padding={theme.spacing.md}>
          <View style={styles.paymentScheduleRow}>
            <Ionicons name="time-outline" size={20} color={theme.colors.turquoise} />
            <Text style={styles.paymentScheduleText}>
              Los retiros se procesan de lunes a viernes entre las 18 y 20 hs. Se transfiere el
              saldo de viajes con Mercado Pago y transferencia. Los cobros en efectivo ya los tenes
              y se descuentan del saldo a transferir.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
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
    ...theme.fontStyles.label,
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
  paymentScheduleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  paymentScheduleText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  exemptNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: '#E8FAF8',
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
