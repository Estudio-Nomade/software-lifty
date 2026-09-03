import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { ApiError } from '../api/types';
import type { District } from '../api/types';
import { stripHtml } from '../lib/stripHtml';
import { theme } from '../theme';
import { Button } from './Button';
import { Text } from './ui/Text';

export type DistrictPickerSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  /** Called after successful PUT /drivers/me/district (including 409 already set). */
  onAssigned: () => void;
};

type Step = 'list' | 'terms';

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.8;

export const DistrictPickerSheet: React.FC<DistrictPickerSheetProps> = ({
  visible,
  onDismiss,
  onAssigned,
}) => {
  const [step, setStep] = useState<Step>('list');
  const [districts, setDistricts] = useState<District[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<District | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<string | null>(null);
  /** District id whose terms/privacy are currently loaded — must match selected on accept. */
  const [termsDistrictId, setTermsDistrictId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const detailGenRef = useRef(0);

  const fetchDistricts = useCallback(async () => {
    try {
      setLoadingList(true);
      setListError(null);
      const { data: body } = await apiClient.get('/districts');
      const payload = body?.data ?? body;
      setDistricts(payload.districts ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar municipios';
      setListError(message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    detailGenRef.current += 1;
    setStep('list');
    setSelected(null);
    setTerms(null);
    setPrivacy(null);
    setTermsDistrictId(null);
    setDetailError(null);
    setSubmitError(null);
    setSubmitting(false);
    setLoadingDetail(false);
    void fetchDistricts();
  }, [visible, fetchDistricts]);

  const handleSelect = async (district: District) => {
    if (loadingDetail || submitting) return;
    const gen = ++detailGenRef.current;
    setSelected(district);
    setStep('terms');
    setDetailError(null);
    setSubmitError(null);
    setTerms(null);
    setPrivacy(null);
    setTermsDistrictId(null);
    try {
      setLoadingDetail(true);
      const { data: body } = await apiClient.get(`/districts/${district.id}`);
      if (gen !== detailGenRef.current) return;
      const payload = body?.data ?? body;
      setTerms(payload.terms_and_conditions ?? null);
      setPrivacy(payload.privacy_policy ?? null);
      setTermsDistrictId(district.id);
    } catch (err: unknown) {
      if (gen !== detailGenRef.current) return;
      const message =
        err instanceof Error ? err.message : 'No se pudieron cargar los términos del municipio';
      setDetailError(message);
    } finally {
      if (gen === detailGenRef.current) {
        setLoadingDetail(false);
      }
    }
  };

  const handleBackToList = () => {
    if (submitting || loadingDetail) return;
    detailGenRef.current += 1;
    setStep('list');
    setDetailError(null);
    setSubmitError(null);
    setTerms(null);
    setPrivacy(null);
    setTermsDistrictId(null);
    setLoadingDetail(false);
  };

  const handleDismiss = () => {
    if (submitting) return;
    onDismiss();
  };

  const handleAccept = async () => {
    if (!selected || submitting || loadingDetail) return;
    // Accept only when loaded terms belong to the currently selected district.
    if (termsDistrictId !== selected.id) return;
    try {
      setSubmitting(true);
      setSubmitError(null);
      await apiClient.put('/drivers/me/district', { district_id: selected.id });
      onAssigned();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'DISTRICT_ALREADY_SET') {
        onAssigned();
        return;
      }
      const message =
        err instanceof Error ? err.message : 'No se pudo confirmar el municipio. Intentá de nuevo.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const termsReady = selected != null && termsDistrictId === selected.id && !loadingDetail;

  const renderItem = ({ item }: { item: District }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => void handleSelect(item)}
      activeOpacity={0.7}
      disabled={loadingDetail || submitting}
    >
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemProvince}>{item.province}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            {step === 'terms' ? (
              <TouchableOpacity
                onPress={handleBackToList}
                disabled={submitting}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Volver"
              >
                <Text style={styles.backText}>←</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            )}
            <TouchableOpacity
              onPress={handleDismiss}
              disabled={submitting}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {step === 'list' ? (
            <View style={styles.body}>
              <Text style={styles.title}>Elegí tu municipio</Text>
              <Text style={styles.subtitle}>
                Vas a trabajar solo en esa zona. La elección no se puede cambiar.
              </Text>
              {loadingList ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.turquoise}
                  style={styles.loader}
                />
              ) : listError ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{listError}</Text>
                  <TouchableOpacity onPress={() => void fetchDistricts()}>
                    <Text style={styles.retryText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : districts.length === 0 ? (
                <Text style={styles.emptyText}>
                  No hay municipios disponibles. Contactá a soporte.
                </Text>
              ) : (
                <FlatList
                  data={districts}
                  renderItem={renderItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                  style={styles.listFlex}
                  pointerEvents={loadingDetail || submitting ? 'none' : 'auto'}
                />
              )}
              <TouchableOpacity
                onPress={handleDismiss}
                disabled={submitting}
                style={styles.dismissLink}
              >
                <Text style={styles.dismissLinkText}>Ahora no</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={styles.title}>{selected?.name ?? 'Términos'}</Text>
              {loadingDetail ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.turquoise}
                  style={styles.loader}
                />
              ) : detailError ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{detailError}</Text>
                  {selected ? (
                    <TouchableOpacity onPress={() => void handleSelect(selected)}>
                      <Text style={styles.retryText}>Reintentar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <>
                  <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                    {terms ? (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Términos y Condiciones</Text>
                        <Text style={styles.sectionText}>{stripHtml(terms)}</Text>
                      </View>
                    ) : null}
                    {privacy ? (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Política de Privacidad</Text>
                        <Text style={styles.sectionText}>{stripHtml(privacy)}</Text>
                      </View>
                    ) : null}
                  </ScrollView>
                  <View style={styles.footer}>
                    {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
                    <Button
                      title="ACEPTAR Y CONTINUAR"
                      variant="cta"
                      onPress={() => void handleAccept()}
                      loading={submitting}
                      disabled={submitting || loadingDetail || !termsReady}
                    />
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 42, 68, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: SHEET_MAX_HEIGHT,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 24 },
  backText: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.bold,
  },
  closeText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    fontWeight: theme.fontWeight.bold,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    gap: theme.spacing.md,
    minHeight: 200,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
  listFlex: { flexGrow: 1, flexShrink: 1 },
  list: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  item: {
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    gap: theme.spacing.xs,
  },
  itemName: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
  },
  itemProvince: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  loader: { marginTop: theme.spacing.xl },
  errorContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.dangerRed,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
  },
  retryText: {
    color: theme.colors.turquoise,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.xl,
  },
  dismissLink: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
  },
  dismissLinkText: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.md,
  },
  scroll: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { gap: theme.spacing.lg, paddingBottom: theme.spacing.md },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  sectionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    lineHeight: 24,
  },
  footer: {
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.md,
  },
  submitError: {
    color: theme.colors.dangerRed,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
});
