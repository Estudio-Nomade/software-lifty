import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { apiClient, getValidated } from '../api/client';
import { ApiError, documentSchema, driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { OnboardingCard, OnboardingChrome } from '../components/OnboardingChrome';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  INSURANCE_COVERAGE_OPTIONS,
  type InsuranceCoverageType,
  MOTO_INSURANCE_COVERAGE_HINT,
  MOTO_INSURANCE_COVERAGE_REQUIRED_MSG,
  insuranceCoverageFromApi,
} from '../lib/insuranceCoverage';
import {
  type HydratedDocsState,
  type HydratedSideState,
  allDocsSatisfied,
  emptyHydratedDocs,
  hydrateDocsFromApi,
} from '../lib/onboardingDocsHydrate';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { resolveReviewGate } from '../lib/reviewGate';
import { vehicleTypeFromApi } from '../lib/vehicleForm';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { DOC_SIDES, type DocBase, type DocSide, uploadDocumentToBackend } from '../utils/upload';

const meVehicleSchema = z.object({
  vehicle: z
    .object({
      vehicle_type: z.string().nullable().optional(),
      insurance_coverage_type: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DocType = DocBase;
type PickMethod = 'camera' | 'gallery' | 'pdf';

const DOCS: { type: DocType; label: string }[] = [
  { type: 'drivers_license', label: 'Licencia de conducir' },
  { type: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { type: 'vehicle_insurance', label: 'Seguro del vehiculo' },
  {
    type: 'platform_rc_insurance',
    label: 'Seguro de Responsabilidad Civil',
  },
  { type: 'background_check', label: 'Certificado de antecedentes penales' },
  { type: 'rndg', label: 'Registro Nacional de Datos Geneticos (RNDG)' },
];

const SIDE_LABELS: Record<DocSide, string> = { front: 'Frente', back: 'Dorso' };

function allowsPdf(docType: DocType): boolean {
  return docType === 'vehicle_insurance' || docType === 'platform_rc_insurance';
}

function sideLabelFor(docType: DocType, side: DocSide): string {
  if (allowsPdf(docType) && DOC_SIDES[docType].length === 1) {
    return 'Archivo o foto';
  }
  return SIDE_LABELS[side];
}

function badgeFor(state: HydratedSideState): { label: string; color: string } | null {
  if (state.needsReplace && !state.replacedInSession) {
    return { label: 'Rehacer', color: theme.colors.dangerRed };
  }
  if (state.serverStatus === 'approved' && !state.replacedInSession) {
    return { label: 'OK', color: theme.colors.primary };
  }
  if (state.serverStatus === 'pending_review' && !state.replacedInSession) {
    return { label: 'En revisión', color: theme.colors.primary };
  }
  return null;
}

export const OnboardingStep2Screen: React.FC = () => {
  const navigation = useAppNavigation();
  const { reviewReason: reviewReasonParam } = useLocalSearchParams<{ reviewReason?: string }>();
  const driverId = useAuthStore((s) => s.driverId);
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const [docs, setDocs] = useState<HydratedDocsState>(emptyHydratedDocs);
  const [hydrating, setHydrating] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(
    typeof reviewReasonParam === 'string' && reviewReasonParam.trim()
      ? reviewReasonParam.trim()
      : null,
  );
  const [partialFix, setPartialFix] = useState(false);
  const [isMoto, setIsMoto] = useState(false);
  const [insuranceCoverage, setInsuranceCoverage] = useState<InsuranceCoverageType | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [savingCoverage, setSavingCoverage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, documents, me] = await Promise.all([
          getValidated('/drivers/me/status', driverStatusSchema),
          getValidated('/drivers/me/documents', z.array(documentSchema)),
          getValidated('/drivers/me', meVehicleSchema),
        ]);
        if (cancelled) return;
        if (status.admin_review_notes?.trim()) {
          setRejectReason(status.admin_review_notes.trim());
        }
        if (status.status === 'rejected') {
          useAuthStore.getState().setDriverStatus('rejected');
        }
        const hydrated = hydrateDocsFromApi(documents);
        setDocs(hydrated);
        const moto = vehicleTypeFromApi(me.vehicle?.vehicle_type) === 'Moto';
        setIsMoto(moto);
        if (moto) {
          setInsuranceCoverage(insuranceCoverageFromApi(me.vehicle?.insurance_coverage_type));
        } else {
          setInsuranceCoverage(null);
        }
        const hasOk = (Object.keys(DOC_SIDES) as DocBase[]).some((dt) =>
          DOC_SIDES[dt].some((side) => {
            const s = hydrated[dt][side];
            return s.serverStatus === 'approved' || s.serverStatus === 'pending_review';
          }),
        );
        const hasGap = (Object.keys(DOC_SIDES) as DocBase[]).some((dt) =>
          DOC_SIDES[dt].some((side) => {
            const s = hydrated[dt][side];
            return s.needsReplace || (!s.uploaded && s.serverStatus !== 'approved');
          }),
        );
        setPartialFix(hasOk && hasGap);
      } catch {
        // keep empty local state / push param
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allUploaded = allDocsSatisfied(docs);
  const coverageReady = !isMoto || insuranceCoverage != null;

  const setSideError = useCallback((docType: DocType, side: DocSide, error: string) => {
    setDocs((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        [side]: { ...prev[docType][side], error },
      },
    }));
  }, []);

  const handlePick = useCallback(
    async (docType: DocType, side: DocSide, method: PickMethod) => {
      if (!driverId) {
        setSideError(docType, side, 'Sesion no valida. Reincia la app.');
        return;
      }

      if (method === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setSideError(docType, side, 'Permiso de camara denegado');
          return;
        }
      }

      let uri: string | null = null;
      let name: string | null = null;
      let mimeType: string | null = null;
      let fileSize: number | null = null;

      try {
        if (method === 'pdf') {
          const result = await DocumentPicker.getDocumentAsync({
            type: 'application/pdf',
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.name ?? `seguro_${Date.now()}.pdf`;
          mimeType = asset.mimeType ?? 'application/pdf';
          fileSize = asset.size ?? null;
        } else if (method === 'camera') {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.fileName ?? `photo_${Date.now()}.jpg`;
          mimeType = asset.mimeType ?? 'image/jpeg';
          fileSize = asset.fileSize ?? null;
        } else {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.fileName ?? `image_${Date.now()}.jpg`;
          mimeType = asset.mimeType ?? 'image/jpeg';
          fileSize = asset.fileSize ?? null;
        }

        if (fileSize && fileSize > MAX_FILE_SIZE) {
          setSideError(docType, side, 'El archivo debe ser menor a 10MB');
          return;
        }

        const isPdf =
          mimeType === 'application/pdf' ||
          name?.toLowerCase().endsWith('.pdf') === true ||
          method === 'pdf';

        if (!isPdf) {
          try {
            const compressed = await compressImage(uri!);
            uri = compressed.uri;
            name = name?.replace(/\.[^.]+$/, '.jpg') ?? `photo_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
          } catch (err) {
            console.warn('Image compression failed, using original:', err);
          }
        } else {
          mimeType = 'application/pdf';
          if (!name?.toLowerCase().endsWith('.pdf')) {
            name = `${name ?? `seguro_${Date.now()}`}.pdf`.replace(/\.pdf\.pdf$/i, '.pdf');
          }
        }

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              fileUri: uri,
              fileName: name,
              uploading: true,
              error: null,
            },
          },
        }));

        const result = await uploadDocumentToBackend(uri!, name!, mimeType!, docType, side);

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              fileUrl: result.file_url,
              fileName: name,
              fileUri: uri,
              uploading: false,
              uploaded: true,
              needsReplace: false,
              replacedInSession: true,
              serverStatus: 'pending_review',
              isPdf,
              error: null,
            },
          },
        }));
      } catch (err: unknown) {
        if (err instanceof ApiError && err.code === 'KYC_REQUIRED') {
          const kycRoute = STEP_ROUTE.kyc;
          if (kycRoute) navigation.replace(kycRoute.screen);
          return;
        }
        const message = err instanceof Error ? err.message : 'Error al subir el documento';
        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              uploading: false,
              uploaded: false,
              replacedInSession: false,
              error: message,
            },
          },
        }));
      }
    },
    [driverId, navigation, setSideError],
  );

  const handleRetry = useCallback((docType: DocType, side: DocSide) => {
    setDocs((prev) => {
      const prevSide = prev[docType][side];
      return {
        ...prev,
        [docType]: {
          ...prev[docType],
          [side]: {
            ...prevSide,
            fileUri: null,
            fileName: prevSide.needsReplace ? 'Rehacer' : null,
            fileUrl: prevSide.needsReplace ? prevSide.fileUrl : null,
            uploaded: false,
            replacedInSession: false,
            error: null,
            uploading: false,
          },
        },
      };
    });
  }, []);

  const handleSelectCoverage = useCallback(async (value: InsuranceCoverageType) => {
    setInsuranceCoverage(value);
    setCoverageError(null);
    setSavingCoverage(true);
    try {
      await apiClient.put('/drivers/me', {
        vehicle_insurance_coverage_type: value,
      });
    } catch (err: unknown) {
      setInsuranceCoverage(null);
      setCoverageError(err instanceof Error ? err.message : MOTO_INSURANCE_COVERAGE_REQUIRED_MSG);
    } finally {
      setSavingCoverage(false);
    }
  }, []);

  const handleVerify = useCallback(async () => {
    if (isMoto && !insuranceCoverage) {
      setCoverageError(MOTO_INSURANCE_COVERAGE_REQUIRED_MSG);
      setVerifyError(MOTO_INSURANCE_COVERAGE_REQUIRED_MSG);
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const status = await getValidated('/drivers/me/status', driverStatusSchema);
      if (status.status === 'under_review' || status.step === 'review') {
        useAuthStore.getState().setDriverStatus('under_review');
      }
      const gate = resolveReviewGate(status.step);
      if (!gate.ok) {
        setVerifyError(gate.message);
        return;
      }
      navigation.navigate('WaitingApproval');
    } catch (err: unknown) {
      setVerifyError(
        err instanceof Error ? err.message : 'No pudimos verificar tu estado. Reintenta.',
      );
    } finally {
      setVerifying(false);
    }
  }, [insuranceCoverage, isMoto, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Documentos" onBack={() => navigation.goBack()} variant="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OnboardingChrome
          step={3}
          kicker="Documentos"
          title="Subí tus documentos"
          subtitle="Los necesitamos para habilitar tu cuenta."
        />

        {rejectReason || driverStatus === 'rejected' || partialFix ? (
          <View style={styles.rejectBanner}>
            <Text style={styles.rejectTitle}>
              {partialFix ? 'Solo tenés que subir lo marcado' : 'No pudimos aprobar tus documentos'}
            </Text>
            <Text style={styles.rejectBody}>
              {rejectReason ??
                (partialFix
                  ? 'El resto ya está cargado. Completá lo que falta o está en rojo.'
                  : 'Revisá el motivo en el mail y volvé a subir lo que falte.')}
            </Text>
          </View>
        ) : null}

        {hydrating ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          DOCS.map((doc) => (
            <OnboardingCard key={doc.type} style={styles.docCard}>
              <View style={styles.docHeader}>
                <View style={styles.uploadIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={theme.colors.primary}
                    accessibilityLabel="Subir documento"
                  />
                </View>
                <Text style={styles.uploadTitle}>{doc.label}</Text>
              </View>
              {doc.type === 'vehicle_insurance' ? (
                <Text style={styles.hintText}>
                  Alcanza un archivo o foto del seguro (PDF o imagen). No hace falta dorso.
                </Text>
              ) : null}
              {doc.type === 'vehicle_insurance' && isMoto ? (
                <View style={styles.coverageBlock}>
                  <Text style={styles.hintText}>{MOTO_INSURANCE_COVERAGE_HINT}</Text>
                  <View style={styles.coverageChips} accessibilityRole="radiogroup">
                    {INSURANCE_COVERAGE_OPTIONS.map((opt) => {
                      const selected = insuranceCoverage === opt.api;
                      return (
                        <Pressable
                          key={opt.api}
                          style={({ pressed }) => [
                            styles.coverageChip,
                            selected && styles.coverageChipSelected,
                            pressed && !selected && styles.coverageChipPressed,
                          ]}
                          onPress={() => handleSelectCoverage(opt.api)}
                          disabled={savingCoverage}
                          hitSlop={8}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={opt.label}
                          testID={`insurance-coverage-${opt.api}`}
                        >
                          <Text
                            style={[
                              styles.coverageChipText,
                              selected && styles.coverageChipTextSelected,
                            ]}
                            pointerEvents="none"
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {coverageError ? <Text style={styles.errorText}>{coverageError}</Text> : null}
                </View>
              ) : null}
              {doc.type === 'platform_rc_insurance' ? (
                <Text style={styles.hintText}>
                  Cobertura de responsabilidad civil mientras trabajás con apps. Es distinto al
                  seguro del auto.
                </Text>
              ) : null}

              {DOC_SIDES[doc.type].map((side) => {
                const state = docs[doc.type][side];
                const label = sideLabelFor(doc.type, side);
                const showSideLabel = DOC_SIDES[doc.type].length > 1 || allowsPdf(doc.type);
                const badge = badgeFor(state);
                const showAsOk = sideSatisfiedUi(state);
                return (
                  <View key={side} style={styles.sideBlock}>
                    {showSideLabel ? <Text style={styles.sideLabel}>{label}</Text> : null}

                    {state.uploading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : showAsOk ? (
                      <View style={styles.uploadedRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={
                            state.needsReplace && !state.replacedInSession
                              ? theme.colors.dangerRed
                              : theme.colors.primary
                          }
                          accessibilityLabel="Documento subido"
                        />
                        <Text
                          style={[
                            styles.fileName,
                            state.needsReplace && !state.replacedInSession
                              ? styles.fileNameReject
                              : null,
                          ]}
                          numberOfLines={1}
                        >
                          {state.fileName ?? 'Documento cargado'}
                        </Text>
                        {badge ? (
                          <Text style={[styles.badge, { color: badge.color }]}>{badge.label}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.uploadOptions}>
                        {state.needsReplace && state.fileName ? (
                          <Text style={styles.rehacerHint}>Rehacer — subí una versión nueva</Text>
                        ) : null}
                        <TouchableOpacity
                          style={styles.uploadOption}
                          onPress={() => handlePick(doc.type, side, 'camera')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>Sacar foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.uploadOption}
                          onPress={() => handlePick(doc.type, side, 'gallery')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>Subir de galería</Text>
                        </TouchableOpacity>
                        {allowsPdf(doc.type) ? (
                          <TouchableOpacity
                            style={styles.uploadOption}
                            onPress={() => handlePick(doc.type, side, 'pdf')}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.optionText}>Archivo PDF</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {state.error ? (
                      <View style={styles.errorRow}>
                        <Text style={styles.errorText}>{state.error}</Text>
                        <TouchableOpacity onPress={() => handleRetry(doc.type, side)}>
                          <Text style={styles.retryText}>Reintentar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </OnboardingCard>
          ))
        )}

        {verifyError ? <Text style={styles.verifyError}>{verifyError}</Text> : null}

        <Button
          title={verifying ? 'Verificando…' : 'Enviar documentos'}
          onPress={handleVerify}
          style={styles.button}
          disabled={!allUploaded || !coverageReady || verifying || hydrating || savingCoverage}
          variant="cta"
        />
      </ScrollView>
    </View>
  );
};

/** UI: show check row for OK sides; rejected without replace still shows pickers. */
function sideSatisfiedUi(state: HydratedSideState): boolean {
  if (state.uploading) return false;
  if (state.needsReplace && !state.replacedInSession) return false;
  if (state.serverStatus === 'approved' || state.serverStatus === 'pending_review') return true;
  return state.uploaded || state.replacedInSession;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
  rejectBanner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.35)',
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    ...theme.shadows.card,
  },
  rejectTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.dangerRed,
  },
  rejectBody: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  docCard: {
    gap: theme.spacing.sm,
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
  },
  uploadIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  hintText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    width: '100%',
    lineHeight: 18,
  },
  coverageBlock: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  coverageChips: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: '100%',
  },
  coverageChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  coverageChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  coverageChipPressed: {
    opacity: 0.85,
    borderColor: theme.colors.primary,
  },
  coverageChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.semibold,
    textAlign: 'center',
  },
  coverageChipTextSelected: {
    color: theme.colors.white,
    fontFamily: theme.fontFamily.bold,
  },
  sideBlock: {
    width: '100%',
    gap: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.sm,
  },
  sideLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  uploadOptions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  uploadOption: {
    minHeight: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  optionText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  uploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    minHeight: 44,
  },
  fileName: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
    flexShrink: 1,
    flex: 1,
  },
  fileNameReject: {
    color: theme.colors.dangerRed,
  },
  badge: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semibold,
  },
  rehacerHint: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.dangerRed,
  },
  errorRow: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  verifyError: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
});
