import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  formatCommissionReceiptDate,
  formatCommissionReceiptStatus,
  isSafeHttpUrl,
} from '../lib/commission';
import { theme } from '../theme';
import { uploadCommissionReceipt } from '../utils/upload';

type PayoutInfo = {
  alias: string | null;
  cvu: string | null;
  holder: string | null;
  bank: string | null;
  platform_debt: number;
  debt_cap_ars: number;
};

type CommissionReceipt = {
  id: string;
  amount_ars: number;
  debt_before_ars: number;
  status: string;
  created_at: string;
  file_url: string;
};

type SelectedFile = {
  uri: string;
  name: string;
  mimeType: string;
};

const STATUS_VISUAL: Record<string, { bg: string; fg: string }> = {
  pending_review: { bg: theme.colors.amber, fg: theme.colors.white },
  approved: { bg: theme.colors.success, fg: theme.colors.white },
  rejected_fraud: { bg: theme.colors.dangerRed, fg: theme.colors.white },
};

function unwrapListPayload(raw: unknown): CommissionReceipt[] {
  if (Array.isArray(raw)) return raw as CommissionReceipt[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: CommissionReceipt[] }).data;
  }
  return [];
}

async function openReceiptFile(url: string) {
  if (!isSafeHttpUrl(url)) {
    Alert.alert('Error', 'No se pudo abrir el comprobante');
    return;
  }
  try {
    await Linking.openURL(url.trim());
  } catch {
    Alert.alert('Error', 'No se pudo abrir el comprobante');
  }
}

function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

async function copyText(label: string, value: string) {
  try {
    await Share.share({ message: value, title: label });
  } catch {
    Alert.alert(label, value);
  }
}

function formatMoney(n: number) {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

type ReceiptCardProps = {
  item: CommissionReceipt;
};

const ReceiptCard: React.FC<ReceiptCardProps> = ({ item }) => {
  const amount = Number(item.amount_ars) || 0;
  const statusLabel = formatCommissionReceiptStatus(item.status);
  const dateLabel = formatCommissionReceiptDate(item.created_at);
  const hasFile = isSafeHttpUrl(item.file_url);
  const visual = STATUS_VISUAL[item.status] ?? {
    bg: theme.colors.mediumGray,
    fg: theme.colors.white,
  };

  return (
    <TouchableOpacity
      style={styles.receiptCard}
      onPress={() => {
        if (hasFile) openReceiptFile(item.file_url);
      }}
      disabled={!hasFile}
      activeOpacity={hasFile ? 0.7 : 1}
      accessibilityRole={hasFile ? 'button' : 'text'}
      accessibilityLabel={`${dateLabel}, ${amount} pesos, ${statusLabel}${hasFile ? ', ver comprobante' : ''}`}
    >
      <View style={styles.receiptTop}>
        <Text style={styles.receiptDate}>{dateLabel}</Text>
        <View style={[styles.statusPill, { backgroundColor: visual.bg }]}>
          <Text style={[styles.statusPillText, { color: visual.fg }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.receiptBottom}>
        <Text style={styles.receiptAmount}>{formatMoney(amount)}</Text>
        {hasFile ? (
          <View style={styles.viewRow}>
            <Text style={styles.viewFileLink}>Ver archivo</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.turquoise} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export const PayCommissionDebtScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const padBottom = Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.lg;

  const {
    data: payout,
    isLoading,
    error,
    refetch,
  } = useQuery<PayoutInfo>({
    queryKey: ['payout-info'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/payout-info');
      return response.data.data ?? response.data;
    },
    // Admin can change alias/CVU while this screen is open — Realtime invalidates; keep refetch eager.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  const {
    data: receipts = [],
    isLoading: receiptsLoading,
    isError: receiptsError,
    refetch: refetchReceipts,
  } = useQuery<CommissionReceipt[]>({
    queryKey: ['commission-receipts'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/commission-receipts');
      return unwrapListPayload(response.data.data ?? response.data);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  /** Only use debt after payout resolved — avoid $0 / "Al día" flash while loading. */
  const payoutReady = payout != null;
  const debt = payoutReady ? Number(payout.platform_debt) || 0 : 0;
  const [amountText, setAmountText] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);

  useEffect(() => {
    if (payoutReady && amountText === '') {
      setAmountText(String(Math.round(Number(payout.platform_debt) || 0)));
    }
  }, [payoutReady, payout, amountText]);

  const accountConfigured = Boolean(payoutReady && (payout.alias?.trim() || payout.cvu?.trim()));

  const amountParsed = useMemo(() => parseAmountInput(amountText), [amountText]);
  const amountValid = amountParsed != null && amountParsed >= debt && amountParsed >= 1;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!file || amountParsed == null) {
        throw new Error('Completá monto y comprobante');
      }
      return uploadCommissionReceipt(file.uri, file.name, file.mimeType, amountParsed);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['earnings-daily'] });
      await queryClient.invalidateQueries({ queryKey: ['payout-info'] });
      await queryClient.invalidateQueries({ queryKey: ['commission-receipts'] });
      Alert.alert('Listo', 'Deuda saldada. Ya podés conectarte.', [
        {
          text: 'OK',
          onPress: () => navigation.replace('Active'),
        },
      ]);
    },
    onError: (err: unknown) => {
      const ax = err as {
        response?: { data?: { error?: { message?: string; code?: string } | string } };
        message?: string;
      };
      const payload = ax.response?.data?.error;
      const msg =
        typeof payload === 'string'
          ? payload
          : payload?.message || ax.message || 'No se pudo enviar el comprobante';
      Alert.alert('Error', msg);
    },
  });

  const pickCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para sacar una foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFile({
        uri: asset.uri,
        name: `comprobante-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
    }
  };

  const pickGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFile({
        uri: asset.uri,
        name: asset.fileName ?? `comprobante-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFile({
        uri: asset.uri,
        name: asset.name || `comprobante-${Date.now()}.pdf`,
        mimeType: asset.mimeType ?? 'application/pdf',
      });
    }
  };

  const canSubmit =
    payoutReady &&
    accountConfigured &&
    amountValid &&
    file != null &&
    !submitMutation.isPending &&
    debt > 0;

  const showPayoutBody = !isLoading && !error && payoutReady;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Comisión Lifty" showBack variant="light" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading || (!error && !payoutReady) ? (
          <ActivityIndicator
            color={theme.colors.turquoise}
            style={{ marginTop: theme.spacing.xl }}
          />
        ) : error ? (
          <Card padding={theme.spacing.lg} style={styles.centerCard}>
            <Ionicons name="alert-circle-outline" size={28} color={theme.colors.dangerRed} />
            <Text style={styles.errorText}>No se pudo cargar la cuenta de cobro</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        ) : showPayoutBody ? (
          <>
            <Card padding={theme.spacing.lg} style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroLabel}>{debt > 0 ? 'Deuda pendiente' : 'Estado'}</Text>
                {debt <= 0 ? (
                  <View style={styles.okChip}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                    <Text style={styles.okChipText}>Al día</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.heroAmount, debt <= 0 && styles.heroAmountClear]}>
                {formatMoney(debt)}
              </Text>
              <Text style={styles.heroHint}>
                {debt > 0
                  ? 'Transferí el total a Lifty y subí el comprobante. No se aceptan pagos parciales.'
                  : 'No tenés deuda de comisión pendiente.'}
              </Text>
            </Card>

            {debt > 0 ? (
              <>
                <Card padding={theme.spacing.lg}>
                  <Text style={styles.sectionTitle}>Cuenta Lifty</Text>
                  {!accountConfigured ? (
                    <Text style={styles.warnText}>
                      Lifty todavía no configuró la cuenta de cobro. Probá más tarde.
                    </Text>
                  ) : (
                    <View style={styles.accountBlock}>
                      {payout?.alias ? (
                        <View style={styles.accountRow}>
                          <View style={styles.accountText}>
                            <Text style={styles.accountLabel}>Alias</Text>
                            <Text style={styles.accountValue} selectable>
                              {payout.alias}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.copyPill}
                            onPress={() => copyText('Alias', payout.alias!)}
                            accessibilityRole="button"
                            accessibilityLabel="Copiar alias"
                          >
                            <Ionicons
                              name="copy-outline"
                              size={14}
                              color={theme.colors.turquoise}
                            />
                            <Text style={styles.copyPillText}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {payout?.cvu ? (
                        <View style={styles.accountRow}>
                          <View style={styles.accountText}>
                            <Text style={styles.accountLabel}>CVU / CBU</Text>
                            <Text style={styles.accountValue} selectable>
                              {payout.cvu}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.copyPill}
                            onPress={() => copyText('CVU', payout.cvu!)}
                            accessibilityRole="button"
                            accessibilityLabel="Copiar CVU"
                          >
                            <Ionicons
                              name="copy-outline"
                              size={14}
                              color={theme.colors.turquoise}
                            />
                            <Text style={styles.copyPillText}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {payout?.holder || payout?.bank ? (
                        <View style={styles.metaBlock}>
                          {payout?.holder ? (
                            <Text style={styles.metaLine}>Titular · {payout.holder}</Text>
                          ) : null}
                          {payout?.bank ? (
                            <Text style={styles.metaLine}>Banco · {payout.bank}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  )}
                </Card>

                <Card padding={theme.spacing.lg}>
                  <Text style={styles.sectionTitle}>Monto transferido</Text>
                  <TextInput
                    style={styles.input}
                    value={amountText}
                    onChangeText={setAmountText}
                    keyboardType="number-pad"
                    placeholder={String(debt || 0)}
                    placeholderTextColor={theme.colors.mediumGray}
                  />
                  {amountParsed != null && amountParsed < debt ? (
                    <Text style={styles.warnText}>
                      El monto debe ser al menos {formatMoney(debt)}
                    </Text>
                  ) : (
                    <Text style={styles.hint}>Debe ser igual o mayor a la deuda</Text>
                  )}
                </Card>

                <Card padding={theme.spacing.lg}>
                  <Text style={styles.sectionTitle}>Comprobante</Text>
                  <Text style={styles.hint}>Foto o PDF del transfer</Text>
                  <View style={styles.pickRow}>
                    <TouchableOpacity
                      style={styles.pickTile}
                      onPress={pickCamera}
                      accessibilityRole="button"
                      accessibilityLabel="Sacar foto"
                    >
                      <Ionicons name="camera-outline" size={22} color={theme.colors.deepBlue} />
                      <Text style={styles.pickTileText}>Cámara</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickTile}
                      onPress={pickGallery}
                      accessibilityRole="button"
                      accessibilityLabel="Elegir de galería"
                    >
                      <Ionicons name="image-outline" size={22} color={theme.colors.deepBlue} />
                      <Text style={styles.pickTileText}>Galería</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickTile}
                      onPress={pickPdf}
                      accessibilityRole="button"
                      accessibilityLabel="Elegir PDF"
                    >
                      <Ionicons name="document-outline" size={22} color={theme.colors.deepBlue} />
                      <Text style={styles.pickTileText}>PDF</Text>
                    </TouchableOpacity>
                  </View>
                  {file ? (
                    <View style={styles.fileChip}>
                      <Ionicons name="attach-outline" size={16} color={theme.colors.turquoise} />
                      <Text style={styles.fileChipText} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setFile(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Quitar archivo"
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={18} color={theme.colors.mediumGray} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.hintMuted}>Ningún archivo seleccionado</Text>
                  )}
                </Card>

                <Button
                  title="Enviar comprobante"
                  onPress={() => submitMutation.mutate()}
                  disabled={!canSubmit}
                  loading={submitMutation.isPending}
                />
              </>
            ) : null}
          </>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Comprobantes enviados</Text>
          {!receiptsLoading && !receiptsError && receipts.length > 0 ? (
            <Text style={styles.historyCount}>{receipts.length}</Text>
          ) : null}
        </View>

        {receiptsLoading ? (
          <ActivityIndicator color={theme.colors.turquoise} />
        ) : receiptsError ? (
          <Card padding={theme.spacing.lg} style={styles.centerCard}>
            <Text style={styles.errorText}>No se pudo cargar el historial</Text>
            <TouchableOpacity onPress={() => refetchReceipts()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        ) : receipts.length === 0 ? (
          <Card padding={theme.spacing.lg} style={styles.emptyHistory}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="receipt-outline" size={28} color={theme.colors.mediumGray} />
            </View>
            <Text style={styles.emptyTitle}>Todavía no enviaste comprobantes</Text>
            <Text style={styles.emptySub}>
              Cuando pagues una comisión, van a aparecer acá con su estado.
            </Text>
          </Card>
        ) : (
          <View style={styles.receiptList}>
            {receipts.map((item) => (
              <ReceiptCard key={item.id} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  centerCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  heroCard: {
    gap: theme.spacing.xs,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  okChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  okChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.success,
  },
  heroAmount: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.dangerRed,
    letterSpacing: -0.5,
  },
  heroAmountClear: {
    color: theme.colors.success,
  },
  heroHint: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  accountBlock: {
    gap: theme.spacing.md,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  accountLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontWeight: theme.fontWeight.medium,
  },
  accountValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.semibold,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
  copyPillText: {
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xs,
  },
  metaBlock: {
    gap: 2,
    paddingTop: theme.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
  },
  metaLine: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  hint: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 18,
  },
  hintMuted: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  warnText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    backgroundColor: theme.colors.white,
  },
  pickRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  pickTile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pickTileText: {
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.sm,
  },
  fileChip: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  fileChipText: {
    flex: 1,
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  errorText: {
    color: theme.colors.dangerRed,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
  },
  retryText: {
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingHorizontal: 2,
  },
  historyTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  historyCount: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.mediumGray,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  receiptList: {
    gap: theme.spacing.sm,
  },
  receiptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  receiptTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  receiptDate: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  statusPillText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  receiptBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptAmount: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewFileLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.turquoise,
  },
  emptyHistory: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  emptyTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
});
