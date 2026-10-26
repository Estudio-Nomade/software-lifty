import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  canAppendMoreFiles,
  emptyHydratedDocs,
  hydrateDocsFromApi,
} from '../lib/onboardingDocsHydrate';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { resolveReviewGate } from '../lib/reviewGate';
import { vehicleTypeFromApi } from '../lib/vehicleForm';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import {
  DOC_SIDES,
  type DocBase,
  type DocSide,
  MAX_FILES_PER_DOC_SIDE,
  uploadDocumentToBackend,
} from '../utils/upload';

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
    label: 'Seguro para transporte de pasajeros',
  },
  { type: 'background_check', label: 'Certificado de antecedentes penales' },
  { type: 'rndg', label: 'Registro Nacional de Datos Geneticos (RNDG)' },
];

const PLATFORM_RC_HINT =
  'Acreditá la cobertura de responsabilidad civil exigida para realizar viajes mediante Lifty, incluyendo a los pasajeros transportados, según la póliza contratada. PDF o imagen; podés sumar más de una foto si no entra en una sola.';

const MULTI_SHOT_HINT =
  'Si no entra en una sola foto, podés sacar o subir hasta 5 imágenes del mismo documento.';

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
  /** Last value confirmed by server (or hydrate). Restored on PUT failure. */
  const committedCoverageRef = useRef<InsuranceCoverageType | null>(null);
  /** Serializes chip PUTs; latest tap while in-flight is queued. */
  const coverageSaveLockRef = useRef(false);
  const pendingCoverageRef = useRef<InsuranceCoverageType | null>(null);

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
          const fromApi = insuranceCoverageFromApi(me.vehicle?.insurance_coverage_type);
          committedCoverageRef.current = fromApi;
          setInsuranceCoverage(fromApi);
        } else {
          committedCoverageRef.current = null;
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
    async (
      docType: DocType,
      side: DocSide,
      method: PickMethod,
      mode: 'replace' | 'append' = 'replace',
    ) => {
      if (!driverId) {
        setSideError(docType, side, 'Sesion no valida. Reincia la app.');
        return;
      }

      if (mode === 'append') {
        const current = docs[docType][side];
        if (!canAppendMoreFiles(current)) {
          setSideError(docType, side, `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento.`);
          return;
        }
      }

      if (method === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setSideError(docType, side, 'Permiso de camara denegado');
          return;
        }
      }

      type PickedAsset = {
        uri: string;
        name: string;
        mimeType: string;
        fileSize: number | null;
      };

      try {
        let picked: PickedAsset[] = [];

        if (method === 'pdf') {
          const result = await DocumentPicker.getDocumentAsync({
            type: 'application/pdf',
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          picked = [
            {
              uri: asset.uri,
              name: asset.name ?? `seguro_${Date.now()}.pdf`,
              mimeType: asset.mimeType ?? 'application/pdf',
              fileSize: asset.size ?? null,
            },
          ];
        } else if (method === 'camera') {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          picked = [
            {
              uri: asset.uri,
              name: asset.fileName ?? `photo_${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? 'image/jpeg',
              fileSize: asset.fileSize ?? null,
            },
          ];
        } else {
          const remaining =
            mode === 'append'
              ? Math.max(0, MAX_FILES_PER_DOC_SIDE - (docs[docType][side].files.length || 0))
              : 1;
          if (remaining <= 0) {
            setSideError(docType, side, `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento.`);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 0.7,
            allowsMultipleSelection: mode === 'append',
            selectionLimit: mode === 'append' ? remaining : 1,
          });
          if (result.canceled || !result.assets?.[0]) return;
          picked = result.assets.map((asset, i) => ({
            uri: asset.uri,
            name: asset.fileName ?? `image_${Date.now()}_${i}.jpg`,
            mimeType: asset.mimeType ?? 'image/jpeg',
            fileSize: asset.fileSize ?? null,
          }));
        }

        for (const asset of picked) {
          if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
            setSideError(docType, side, 'El archivo debe ser menor a 10MB');
            return;
          }
        }

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              uploading: true,
              error: null,
            },
          },
        }));

        let lastError: string | null = null;
        for (let i = 0; i < picked.length; i++) {
          let { uri, name, mimeType } = picked[i]!;
          const isPdf =
            mimeType === 'application/pdf' ||
            name.toLowerCase().endsWith('.pdf') ||
            method === 'pdf';

          if (!isPdf) {
            try {
              const compressed = await compressImage(uri);
              uri = compressed.uri;
              name = name.replace(/\.[^.]+$/, '.jpg') || `photo_${Date.now()}.jpg`;
              mimeType = 'image/jpeg';
            } catch (err) {
              console.warn('Image compression failed, using original:', err);
            }
          } else {
            mimeType = 'application/pdf';
            if (!name.toLowerCase().endsWith('.pdf')) {
              name = `${name || `seguro_${Date.now()}`}.pdf`.replace(/\.pdf\.pdf$/i, '.pdf');
            }
          }

          // replace mode: first file replaces group; multi gallery append: all append.
          const replaceGroup = mode === 'replace' && i === 0;
          try {
            const result = await uploadDocumentToBackend(uri, name, mimeType, docType, side, {
              replaceGroup,
            });

            setDocs((prev) => {
              const prevSide = prev[docType][side];
              const newPart = {
                fileUri: uri,
                fileName: name,
                fileUrl: result.file_url,
                isPdf,
                serverStatus: 'pending_review' as const,
              };
              const files = replaceGroup
                ? [newPart]
                : [...prevSide.files, newPart].slice(0, MAX_FILES_PER_DOC_SIDE);
              const count = files.length;
              return {
                ...prev,
                [docType]: {
                  ...prev[docType],
                  [side]: {
                    ...prevSide,
                    fileUrl: result.file_url,
                    fileName: count > 1 ? `${count} archivos` : name,
                    fileUri: uri,
                    files,
                    uploading: i < picked.length - 1,
                    uploaded: true,
                    needsReplace: false,
                    replacedInSession: true,
                    serverStatus: 'pending_review',
                    isPdf: files.some((f) => f.isPdf),
                    error: null,
                  },
                },
              };
            });
          } catch (err: unknown) {
            if (err instanceof ApiError && err.code === 'KYC_REQUIRED') {
              const kycRoute = STEP_ROUTE.kyc;
              if (kycRoute) navigation.replace(kycRoute.screen);
              return;
            }
            lastError = err instanceof Error ? err.message : 'Error al subir el documento';
            break;
          }
        }

        setDocs((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            [side]: {
              ...prev[docType][side],
              uploading: false,
              ...(lastError ? { error: lastError } : {}),
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
              error: message,
            },
          },
        }));
      }
    },
    [docs, driverId, navigation, setSideError],
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
            files: prevSide.needsReplace ? prevSide.files : [],
            uploaded: false,
            replacedInSession: false,
            error: null,
            uploading: false,
          },
        },
      };
    });
  }, []);

  const handleSelectCoverage = useCallback(
    async (value: InsuranceCoverageType) => {
      if (value === committedCoverageRef.current && !coverageError) return;

      // Coalesce rapid taps: keep latest intent while a PUT is in flight.
      if (coverageSaveLockRef.current) {
        pendingCoverageRef.current = value;
        setInsuranceCoverage(value);
        setCoverageError(null);
        return;
      }

      coverageSaveLockRef.current = true;
      setSavingCoverage(true);
      let next: InsuranceCoverageType | null = value;

      try {
        while (next != null) {
          const toSave = next;
          next = null;
          pendingCoverageRef.current = null;

          if (toSave === committedCoverageRef.current) continue;

          const previous = committedCoverageRef.current;
          setInsuranceCoverage(toSave);
          setCoverageError(null);

          try {
            await apiClient.put('/drivers/me', {
              vehicle_insurance_coverage_type: toSave,
            });
            committedCoverageRef.current = toSave;
            setInsuranceCoverage(toSave);
          } catch (err: unknown) {
            setInsuranceCoverage(previous);
            setCoverageError(
              err instanceof Error ? err.message : MOTO_INSURANCE_COVERAGE_REQUIRED_MSG,
            );
            pendingCoverageRef.current = null;
            break;
          }

          next = pendingCoverageRef.current;
        }
      } finally {
        coverageSaveLockRef.current = false;
        setSavingCoverage(false);
      }
    },
    [coverageError],
  );

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
                  Alcanza un archivo o foto del seguro (PDF o imagen). No hace falta dorso.{' '}
                  {MULTI_SHOT_HINT}
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
                <Text style={styles.hintText}>{PLATFORM_RC_HINT}</Text>
              ) : null}
              {doc.type !== 'vehicle_insurance' && doc.type !== 'platform_rc_insurance' ? (
                <Text style={styles.hintText}>{MULTI_SHOT_HINT}</Text>
              ) : null}

              {DOC_SIDES[doc.type].map((side) => {
                const state = docs[doc.type][side];
                const label = sideLabelFor(doc.type, side);
                const showSideLabel = DOC_SIDES[doc.type].length > 1 || allowsPdf(doc.type);
                const badge = badgeFor(state);
                const showAsOk = sideSatisfiedUi(state);
                const canAppend = showAsOk && canAppendMoreFiles(state) && !state.uploading;
                return (
                  <View key={side} style={styles.sideBlock}>
                    {showSideLabel ? <Text style={styles.sideLabel}>{label}</Text> : null}

                    {state.uploading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : showAsOk ? (
                      <View style={styles.uploadedBlock}>
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
                            <Text style={[styles.badge, { color: badge.color }]}>
                              {badge.label}
                            </Text>
                          ) : null}
                        </View>
                        {canAppend ? (
                          <View style={styles.appendRow}>
                            <TouchableOpacity
                              style={styles.appendOption}
                              onPress={() => handlePick(doc.type, side, 'camera', 'append')}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.appendOptionText}>+ Otra foto</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.appendOption}
                              onPress={() => handlePick(doc.type, side, 'gallery', 'append')}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.appendOptionText}>+ Galería</Text>
                            </TouchableOpacity>
                            {allowsPdf(doc.type) ? (
                              <TouchableOpacity
                                style={styles.appendOption}
                                onPress={() => handlePick(doc.type, side, 'pdf', 'append')}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.appendOptionText}>+ PDF</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                        {!state.needsReplace || state.replacedInSession ? (
                          <TouchableOpacity onPress={() => handleRetry(doc.type, side)} hitSlop={8}>
                            <Text style={styles.retryText}>Reemplazar todo</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.uploadOptions}>
                        {state.needsReplace && state.fileName ? (
                          <Text style={styles.rehacerHint}>Rehacer — subí una versión nueva</Text>
                        ) : null}
                        <TouchableOpacity
                          style={styles.uploadOption}
                          onPress={() => handlePick(doc.type, side, 'camera', 'replace')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>Sacar foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.uploadOption}
                          onPress={() => handlePick(doc.type, side, 'gallery', 'replace')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>Subir de galería</Text>
                        </TouchableOpacity>
                        {allowsPdf(doc.type) ? (
                          <TouchableOpacity
                            style={styles.uploadOption}
                            onPress={() => handlePick(doc.type, side, 'pdf', 'replace')}
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
  uploadedBlock: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  appendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    width: '100%',
  },
  appendOption: {
    minHeight: 40,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  appendOptionText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
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
