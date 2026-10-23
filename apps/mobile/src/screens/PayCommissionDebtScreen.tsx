import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type SelectedFile = {
  uri: string;
  name: string;
  mimeType: string;
};

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
  });

  const debt = payout?.platform_debt ?? 0;
  const [amountText, setAmountText] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);

  useEffect(() => {
    if (payout && amountText === '') {
      setAmountText(String(Math.round(payout.platform_debt)));
    }
  }, [payout, amountText]);

  const accountConfigured = Boolean(payout?.alias?.trim() || payout?.cvu?.trim());

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
    accountConfigured && amountValid && file != null && !submitMutation.isPending && debt > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Pagar comisión" showBack variant="light" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator
            color={theme.colors.turquoise}
            style={{ marginTop: theme.spacing.xl }}
          />
        ) : error ? (
          <Card padding={theme.spacing.lg}>
            <Text style={styles.errorText}>No se pudo cargar la cuenta de cobro</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <>
            <Card padding={theme.spacing.lg}>
              <Text style={styles.cardTitle}>Deuda actual</Text>
              <Text style={styles.debtAmount}>
                ${debt.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.hint}>
                Debés transferir al menos este monto y subir el comprobante. No se aceptan pagos
                parciales.
              </Text>
            </Card>

            <Card padding={theme.spacing.lg}>
              <Text style={styles.cardTitle}>Cuenta Lifty</Text>
              {!accountConfigured ? (
                <Text style={styles.warnText}>
                  Lifty todavía no configuró la cuenta de cobro. Probá más tarde.
                </Text>
              ) : (
                <>
                  {payout?.alias ? (
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>Alias</Text>
                        <Text style={styles.rowValue}>{payout.alias}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => copyText('Alias', payout.alias!)}
                        accessibilityRole="button"
                        accessibilityLabel="Copiar alias"
                      >
                        <Text style={styles.copyLink}>Copiar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {payout?.cvu ? (
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>CVU / CBU</Text>
                        <Text style={styles.rowValue}>{payout.cvu}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => copyText('CVU', payout.cvu!)}
                        accessibilityRole="button"
                        accessibilityLabel="Copiar CVU"
                      >
                        <Text style={styles.copyLink}>Copiar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {payout?.holder ? (
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>Titular</Text>
                        <Text style={styles.rowValue}>{payout.holder}</Text>
                      </View>
                    </View>
                  ) : null}
                  {payout?.bank ? (
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>Banco</Text>
                        <Text style={styles.rowValue}>{payout.bank}</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </Card>

            <Card padding={theme.spacing.lg}>
              <Text style={styles.cardTitle}>Monto transferido</Text>
              <TextInput
                style={styles.input}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="number-pad"
                placeholder={String(debt || 0)}
                placeholderTextColor={theme.colors.mediumGray}
              />
              {amountParsed != null && amountParsed < debt ? (
                <Text style={styles.warnText}>El monto debe ser al menos ${debt}</Text>
              ) : null}
            </Card>

            <Card padding={theme.spacing.lg}>
              <Text style={styles.cardTitle}>Comprobante</Text>
              <Text style={styles.hint}>Foto o PDF del transfer</Text>
              <View style={styles.pickRow}>
                <TouchableOpacity style={styles.pickBtn} onPress={pickCamera}>
                  <Text style={styles.pickBtnText}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickBtn} onPress={pickGallery}>
                  <Text style={styles.pickBtnText}>Galería</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickBtn} onPress={pickPdf}>
                  <Text style={styles.pickBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>
              {file ? (
                <Text style={styles.fileName} numberOfLines={2}>
                  {file.name}
                </Text>
              ) : (
                <Text style={styles.hint}>Ningún archivo seleccionado</Text>
              )}
            </Card>

            <Button
              title="Enviar comprobante"
              onPress={() => submitMutation.mutate()}
              disabled={!canSubmit}
              loading={submitMutation.isPending}
            />
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
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  debtAmount: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.dangerRed,
  },
  hint: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 18,
  },
  warnText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  rowValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  copyLink: {
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
    backgroundColor: theme.colors.white,
  },
  pickRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  pickBtn: {
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  pickBtnText: {
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  fileName: {
    marginTop: theme.spacing.sm,
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.dangerRed,
    marginBottom: theme.spacing.sm,
  },
  retryText: {
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.bold,
  },
});
