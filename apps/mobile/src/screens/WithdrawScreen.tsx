import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { PaymentMethod } from '../api/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const WithdrawScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: async () => {
      const response = await apiClient.get('/earnings/summary');
      return response.data.data ?? response.data;
    },
  });

  const { data: daily } = useQuery({
    queryKey: ['earnings-daily'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/earnings/daily');
      return response.data.data ?? response.data;
    },
  });

  const { data: methods, isLoading: methodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/payment-methods');
      return response.data.data ?? response.data;
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (params: { amount: number; payout_method_id: string }) => {
      const response = await apiClient.post('/payments/withdraw', params);
      return response.data.data ?? response.data;
    },
    onSuccess: (data) => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['earnings-daily'] });
    },
    onError: (err: any) => {
      const message = err instanceof Error ? err.message : 'Error al retirar';
      Alert.alert('Error', message);
    },
  });

  const available = summary?.available_balance ?? 0;
  const debt = summary?.platform_debt ?? 0;
  const retentionTotal =
    daily?.trips?.reduce((sum: number, t: any) => sum + (t.platform_fee ?? 0), 0) ?? 0;
  const parsedAmount = Number.parseFloat(amount) || 0;
  const canWithdraw = parsedAmount > 0 && parsedAmount <= available && selectedMethodId;

  const handleWithdraw = () => {
    if (!canWithdraw || !selectedMethodId) return;
    withdrawMutation.mutate({ amount: parsedAmount, payout_method_id: selectedMethodId });
  };

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setAmount(cleaned);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Navbar title="Retirar saldo" onBack={() => navigation.goBack()} />
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>Solicitud enviada</Text>
          <Text style={styles.successBody}>
            Tu retiro de {formatCurrency(parsedAmount)} sera procesado. Recibiras la transferencia
            en tu cuenta dentro del proximo horario de pago (lunes a viernes de 18 a 20 hs).
          </Text>
          <Button title="Volver a ganancias" onPress={() => navigation.navigate('Earnings')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Retirar saldo" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {summaryLoading ? (
          <SkeletonCard />
        ) : (
          <Card padding={theme.spacing.lg}>
            <Text style={styles.balanceLabel}>Saldo disponible</Text>
            <Text style={styles.balanceAmount}>{formatCurrency(available)}</Text>
            {retentionTotal > 0 && (
              <View style={styles.debtRow}>
                <Text style={styles.debtLabel}>Retencion Lifty hoy</Text>
                <Text style={styles.debtValue}>-{formatCurrency(retentionTotal)}</Text>
              </View>
            )}
            {debt > 0 && (
              <View style={styles.debtRow}>
                <Text style={styles.debtLabel}>Deuda pendiente</Text>
                <Text style={styles.debtValue}>-{formatCurrency(debt)}</Text>
              </View>
            )}
          </Card>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monto a retirar</Text>
          <Input
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="$0"
            keyboardType="numeric"
            style={styles.amountInput}
          />
          {parsedAmount > 0 && (
            <Text style={styles.amountPreview}>{formatCurrency(parsedAmount)}</Text>
          )}
          {parsedAmount > available && (
            <Text style={styles.errorText}>El monto supera tu saldo disponible</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Metodo de pago</Text>
          {methodsLoading ? (
            <SkeletonCard />
          ) : !methods || methods.length === 0 ? (
            <Card padding={theme.spacing.lg}>
              <Text style={styles.noMethodsText}>
                No tenes metodos de pago. Agrega un CVU en Metodo de cobro.
              </Text>
              <Button
                title="Agregar metodo de pago"
                variant="secondary"
                onPress={() => navigation.navigate('PaymentMethod')}
                style={styles.addMethodButton}
              />
            </Card>
          ) : (
            methods.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => setSelectedMethodId(m.id)}
                activeOpacity={0.7}
              >
                <Card
                  padding={theme.spacing.md}
                  style={[
                    styles.methodCard,
                    selectedMethodId === m.id && styles.methodCardSelected,
                  ]}
                >
                  <View style={styles.methodRow}>
                    <View>
                      <Text style={styles.methodTitular}>{m.titular_name || 'Sin alias'}</Text>
                      <Text style={styles.methodCvu}>{m.account_number}</Text>
                      {m.wallet && <Text style={styles.methodBank}>{m.wallet}</Text>}
                    </View>
                    <View
                      style={[styles.radio, selectedMethodId === m.id && styles.radioSelected]}
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </View>

        <Button
          title={withdrawMutation.isPending ? 'Procesando...' : 'Retirar saldo'}
          onPress={handleWithdraw}
          loading={withdrawMutation.isPending}
          disabled={!canWithdraw}
          variant="primary"
          style={styles.withdrawButton}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  balanceLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.xs,
  },
  balanceAmount: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  debtLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
  },
  debtValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.dangerRed,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  amountInput: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
  },
  amountPreview: {
    fontSize: theme.fontSize.md,
    color: theme.colors.turquoise,
    textAlign: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  noMethodsText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.md,
  },
  addMethodButton: {
    alignSelf: 'flex-start',
  },
  methodCard: {
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodCardSelected: {
    borderColor: theme.colors.turquoise,
  },
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  methodTitular: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  methodCvu: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  methodBank: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
  },
  radioSelected: {
    borderColor: theme.colors.turquoise,
    backgroundColor: theme.colors.turquoise,
  },
  withdrawButton: {
    marginTop: theme.spacing.sm,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  successTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  successBody: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
});
