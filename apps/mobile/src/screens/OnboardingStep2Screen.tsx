import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { getValidated } from '../api/client';
import { ApiError, documentSchema, driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  type HydratedDocsState,
  type HydratedSideState,
  allDocsSatisfied,
  emptyHydratedDocs,
  hydrateDocsFromApi,
} from '../lib/onboardingDocsHydrate';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { resolveReviewGate } from '../lib/reviewGate';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { DOC_SIDES, type DocBase, type DocSide, uploadDocumentToBackend } from '../utils/upload';

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
    return { label: 'OK', color: theme.colors.turquoise };
  }
  if (state.serverStatus === 'pending_review' && !state.replacedInSession) {
    return { label: 'En revisión', color: theme.colors.turquoise };
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, documents] = await Promise.all([
          getValidated('/drivers/me/status', driverStatusSchema),
          getValidated('/drivers/me/documents', z.array(documentSchema)),
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

  const handleVerify = useCallback(async () => {
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
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 3/3" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Subi tus documentos</Text>
        <Text style={styles.subtitle}>Los necesitamos para habilitar tu cuenta</Text>

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
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        ) : (
          DOCS.map((doc) => (
            <View key={doc.type} style={styles.uploadBlock}>
              <View style={styles.uploadIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={24}
                  color={theme.colors.mediumGray}
                  accessibilityLabel="Subir documento"
                />
              </View>
              <Text style={styles.uploadTitle}>{doc.label}</Text>
              {doc.type === 'vehicle_insurance' ? (
                <Text style={styles.hintText}>
                  Alcanza un archivo o foto del seguro (PDF o imagen). No hace falta dorso.
                </Text>
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
                      <ActivityIndicator size="small" color={theme.colors.turquoise} />
                    ) : showAsOk ? (
                      <View style={styles.uploadedRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={
                            state.needsReplace && !state.replacedInSession
                              ? theme.colors.dangerRed
                              : theme.colors.turquoise
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
                          <Text style={styles.optionText}>Subir de galeria</Text>
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
            </View>
          ))
        )}

        {verifyError ? <Text style={styles.verifyError}>{verifyError}</Text> : null}

        <Button
          title={verifying ? 'VERIFICANDO…' : 'ENVIAR DOCUMENTOS'}
          onPress={handleVerify}
          style={styles.button}
          disabled={!allUploaded || verifying || hydrating}
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
    backgroundColor: theme.colors.white,
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.md,
  },
  rejectBanner: {
    width: 343,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.lightGray,
    borderWidth: 1,
    borderColor: theme.colors.dangerRed,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  rejectTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.dangerRed,
  },
  rejectBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  uploadBlock: {
    width: 343,
    gap: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  hintText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: '100%',
  },
  sideBlock: {
    width: '100%',
    gap: theme.spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.sm,
  },
  sideLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
  },
  uploadOptions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  uploadOption: {
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  uploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  fileName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    flexShrink: 1,
  },
  fileNameReject: {
    color: theme.colors.dangerRed,
  },
  badge: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  rehacerHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    alignSelf: 'flex-start',
  },
  errorRow: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  retryText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  verifyError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 343,
  },
  button: {
    width: 343,
    marginTop: theme.spacing.md,
  },
});
