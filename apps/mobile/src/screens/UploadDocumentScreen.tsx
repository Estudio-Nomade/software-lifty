import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { getValidated } from '../api/client';
import { documentSchema } from '../api/types';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import {
  type ReuploadPreviewBySide,
  type ReuploadPreviewFile,
  emptyPreviewCopy,
  partitionReuploadPreview,
  statusBadgeEs,
} from '../lib/reuploadDocsPreview';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import type { DocBase, DocSide } from '../utils/upload';
import {
  DOC_SIDES,
  MAX_FILES_PER_DOC_SIDE,
  allowsPdfDoc,
  reuploadDocumentToBackend,
  uploadDocumentToBackend,
  validateDocFileSize,
} from '../utils/upload';

type DocType = DocBase;

const SIDE_LABELS: Record<DocSide, string> = { front: 'Frente', back: 'Dorso' };

type SelectedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

function sideLabelFor(
  docType: DocType | undefined,
  side: DocSide,
  requiredSides: DocSide[],
): string {
  if (allowsPdfDoc(docType) && requiredSides.length === 1) {
    return 'Archivo o foto';
  }
  return SIDE_LABELS[side];
}

function subtitleFor(docType: DocType | undefined, isReupload: boolean): string {
  if (isReupload) {
    return 'Al reemplazar este documento, quedara pendiente de revision. Podés sumar hasta 5 fotos si no entra en una sola.';
  }
  if (docType === 'platform_rc_insurance') {
    return 'Acreditá la cobertura de responsabilidad civil exigida para realizar viajes mediante Lifty, incluyendo a los pasajeros transportados, según la póliza contratada. PDF o imagen; hasta 5 archivos si hace falta.';
  }
  if (docType === 'vehicle_insurance') {
    return 'Subí un archivo o foto del seguro (PDF o imagen). No hace falta dorso. Si no entra en una sola, sumá más fotos (máx. 5).';
  }
  if (docType === 'background_check' || docType === 'rndg') {
    return 'PDF o foto del certificado. Si no entra en una sola imagen, podés sumar hasta 5 archivos.';
  }
  return 'Subí el documento requerido. Si no entra en una sola foto, podés sumar hasta 5 imágenes.';
}

function ServerFileRow({
  file,
  readOnly,
}: {
  file: ReuploadPreviewFile;
  readOnly?: boolean;
}) {
  return (
    <View style={styles.fileRow}>
      {file.isPdf ? (
        <View style={styles.thumbFile}>
          <Text style={styles.thumbIcon}>📄</Text>
        </View>
      ) : (
        <Image source={{ uri: file.fileUrl }} style={styles.thumb} />
      )}
      <View style={styles.serverFileMeta}>
        <Text style={styles.fileRowName} numberOfLines={2}>
          {statusBadgeEs(file.status)}
        </Text>
        {file.reviewComment ? (
          <Text style={styles.reviewComment} numberOfLines={2}>
            {file.reviewComment}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => {
          void Linking.openURL(file.fileUrl);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={readOnly ? 'Ver versión anterior' : 'Ver archivo'}
      >
        <Text style={styles.viewLink}>Ver</Text>
      </TouchableOpacity>
    </View>
  );
}

function PreviewSideBlock({
  title,
  bySide,
  sides,
}: {
  title: string;
  bySide: ReuploadPreviewBySide;
  sides: DocSide[];
}) {
  const total = sides.reduce((n, s) => n + bySide[s].length, 0);
  if (total === 0) return null;
  return (
    <View style={styles.serverSection}>
      <Text style={styles.serverSectionTitle}>{title}</Text>
      {sides.map((side) => {
        const files = bySide[side];
        if (!files.length) return null;
        return (
          <View key={`${title}-${side}`} style={styles.serverSideBlock}>
            {sides.length > 1 ? (
              <Text style={styles.serverSideLabel}>{SIDE_LABELS[side]}</Text>
            ) : null}
            {files.map((file) => (
              <ServerFileRow key={file.id} file={file} readOnly={title.includes('anterior')} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export const UploadDocumentScreen: React.FC = () => {
  const { docType, docLabel, mode } = useLocalSearchParams<{
    docType: DocType;
    docLabel: string;
    mode?: string;
  }>();
  const router = useRouter();

  const isReupload = mode === 'reupload';

  /** Multi-file list per side (append until upload). */
  const [selectedFiles, setSelectedFiles] = useState<Record<DocSide, SelectedFile[]>>({
    front: [],
    back: [],
  });
  const [uploading, setUploading] = useState(false);
  const [loadingServer, setLoadingServer] = useState(isReupload);
  const [serverCurrent, setServerCurrent] = useState<ReuploadPreviewBySide>({
    front: [],
    back: [],
  });
  const [serverPrevious, setServerPrevious] = useState<ReuploadPreviewBySide>({
    front: [],
    back: [],
  });
  const [hasServerCurrent, setHasServerCurrent] = useState(false);
  const [hasServerPrevious, setHasServerPrevious] = useState(false);

  const requiredSides = docType ? DOC_SIDES[docType] : [];
  const bothSelected = requiredSides.every((side) => selectedFiles[side].length > 0);

  const title = docLabel || 'Subir documento';

  const loadServerDocs = useCallback(async () => {
    if (!isReupload || !docType) {
      setLoadingServer(false);
      return;
    }
    setLoadingServer(true);
    try {
      const docs = await getValidated(
        '/drivers/me/documents?include_superseded=1',
        z.array(documentSchema),
      );
      const partitioned = partitionReuploadPreview(docs, docType);
      setServerCurrent(partitioned.current);
      setServerPrevious(partitioned.previous);
      setHasServerCurrent(partitioned.hasCurrent);
      setHasServerPrevious(partitioned.hasPrevious);
    } catch {
      // Keep empty server state; local picker still works.
    } finally {
      setLoadingServer(false);
    }
  }, [docType, isReupload]);

  useEffect(() => {
    void loadServerDocs();
  }, [loadServerDocs]);

  const pushFiles = (side: DocSide, incoming: SelectedFile[]) => {
    setSelectedFiles((prev) => {
      const merged = [...prev[side], ...incoming].slice(0, MAX_FILES_PER_DOC_SIDE);
      if (prev[side].length + incoming.length > MAX_FILES_PER_DOC_SIDE) {
        Alert.alert(
          'Límite',
          `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento. Se guardaron las primeras ${MAX_FILES_PER_DOC_SIDE}.`,
        );
      }
      return { ...prev, [side]: merged };
    });
  };

  const handleCamera = async (side: DocSide) => {
    if (selectedFiles[side].length >= MAX_FILES_PER_DOC_SIDE) {
      Alert.alert('Límite', `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento.`);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la camara para sacar una foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      pushFiles(side, [
        {
          uri: asset.uri,
          name: `photo-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: asset.fileSize,
        },
      ]);
    }
  };

  const handleGallery = async (side: DocSide) => {
    const remaining = MAX_FILES_PER_DOC_SIDE - selectedFiles[side].length;
    if (remaining <= 0) {
      Alert.alert('Límite', `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso denegado',
        'Necesitamos acceso a la galeria para seleccionar una imagen.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });

    if (!result.canceled && result.assets.length > 0) {
      pushFiles(
        side,
        result.assets.map((asset, i) => {
          const extension = asset.uri.split('.').pop() || 'jpg';
          return {
            uri: asset.uri,
            name: `image-${Date.now()}-${i}.${extension}`,
            mimeType: asset.mimeType || 'image/jpeg',
            size: asset.fileSize,
          };
        }),
      );
    }
  };

  const handlePdf = async (side: DocSide) => {
    if (selectedFiles[side].length >= MAX_FILES_PER_DOC_SIDE) {
      Alert.alert('Límite', `Máximo ${MAX_FILES_PER_DOC_SIDE} archivos por documento.`);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const sizeError = validateDocFileSize({ fileSize: asset.size, isPdf: true });
    if (sizeError) {
      Alert.alert('PDF demasiado pesado', sizeError);
      return;
    }

    pushFiles(side, [
      {
        uri: asset.uri,
        name: asset.name ?? `documento_${Date.now()}.pdf`,
        mimeType: asset.mimeType ?? 'application/pdf',
        size: asset.size,
      },
    ]);
  };

  const removeFile = (side: DocSide, index: number) => {
    setSelectedFiles((prev) => ({
      ...prev,
      [side]: prev[side].filter((_, i) => i !== index),
    }));
  };

  const handleUpload = async () => {
    if (!bothSelected || !docType) return;

    setUploading(true);
    try {
      let requiresReview = false;
      for (const side of requiredSides) {
        const files = selectedFiles[side];
        if (!files.length) continue;

        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          let uploadUri = file.uri;
          let uploadName = file.name;
          let uploadMimeType = file.mimeType || 'application/octet-stream';

          const isPdf =
            uploadMimeType === 'application/pdf' || uploadName.toLowerCase().endsWith('.pdf');

          if (isPdf) {
            uploadMimeType = 'application/pdf';
            if (!uploadName.toLowerCase().endsWith('.pdf')) {
              uploadName = `${uploadName}.pdf`;
            }
          } else if (uploadMimeType.startsWith('image/')) {
            try {
              const compressed = await compressImage(uploadUri);
              uploadUri = compressed.uri;
              uploadName = uploadName.replace(/\.[^.]+$/, '.jpg');
              uploadMimeType = 'image/jpeg';
            } catch {}
          }

          // First file of the side replaces the group; further files append.
          const replaceGroup = i === 0;
          if (isReupload) {
            const result = await reuploadDocumentToBackend(
              uploadUri,
              uploadName,
              uploadMimeType,
              docType,
              side,
              { replaceGroup },
            );
            requiresReview = requiresReview || result.requires_review;
          } else {
            await uploadDocumentToBackend(uploadUri, uploadName, uploadMimeType, docType, side, {
              replaceGroup,
            });
          }
        }
      }

      if (isReupload && requiresReview) {
        Alert.alert(
          'Documento enviado',
          'Tu documento quedo pendiente de revision. No vas a poder conectarte hasta que un administrador lo apruebe.',
        );
      }
      router.back();
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Error', 'Ocurrio un error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Navbar title={title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitleFor(docType, isReupload)}</Text>

        {isReupload && loadingServer ? (
          <ActivityIndicator color={theme.colors.turquoise} style={styles.loader} />
        ) : null}

        {isReupload && !loadingServer ? (
          <>
            <PreviewSideBlock title="En Lifty ahora" bySide={serverCurrent} sides={requiredSides} />
            {hasServerPrevious ? (
              <PreviewSideBlock
                title="Versión anterior"
                bySide={serverPrevious}
                sides={requiredSides}
              />
            ) : null}
          </>
        ) : null}

        {requiredSides.map((side) => {
          const files = selectedFiles[side];
          const label = sideLabelFor(docType, side, requiredSides);
          const showSideTitle = requiredSides.length > 1 || allowsPdfDoc(docType) || true;
          const canAddMore = files.length < MAX_FILES_PER_DOC_SIDE;
          const emptyCopy = emptyPreviewCopy({
            hasServerCurrent: isReupload && hasServerCurrent && serverCurrent[side].length > 0,
            hasLocalFiles: files.length > 0,
          });
          return (
            <View key={side} style={styles.sideSection}>
              {showSideTitle ? <Text style={styles.sideTitle}>{label}</Text> : null}

              {files.length === 0 ? (
                <View style={styles.preview}>
                  <Text style={styles.previewIcon}>📄</Text>
                  <Text style={styles.previewText}>{emptyCopy}</Text>
                </View>
              ) : (
                <View style={styles.fileList}>
                  {files.map((file, index) => {
                    const isImage = file.mimeType?.startsWith('image/');
                    return (
                      <View key={`${file.uri}-${index}`} style={styles.fileRow}>
                        {isImage ? (
                          <Image source={{ uri: file.uri }} style={styles.thumb} />
                        ) : (
                          <View style={styles.thumbFile}>
                            <Text style={styles.thumbIcon}>📄</Text>
                          </View>
                        )}
                        <Text style={styles.fileRowName} numberOfLines={2}>
                          {files.length > 1 ? `${index + 1}/${files.length} · ` : ''}
                          {file.name}
                        </Text>
                        <TouchableOpacity onPress={() => removeFile(side, index)} hitSlop={8}>
                          <Text style={styles.removeText}>Quitar</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {canAddMore ? (
                <View style={styles.options}>
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleCamera(side)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>
                      {files.length ? '📷 Otra foto' : '📷 Sacar foto'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleGallery(side)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>
                      {files.length ? '🖼 Más de galería' : '🖼 Subir de galeria'}
                    </Text>
                  </TouchableOpacity>
                  {allowsPdfDoc(docType) ? (
                    <TouchableOpacity
                      style={styles.option}
                      onPress={() => handlePdf(side)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.optionText}>
                        {files.length ? '📄 Otro PDF' : '📄 Archivo PDF'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.limitNote}>
                  Máximo {MAX_FILES_PER_DOC_SIDE} archivos. Quitá uno para agregar otro.
                </Text>
              )}
            </View>
          );
        })}

        <Button
          title="SUBIR"
          variant="primary"
          onPress={handleUpload}
          loading={uploading}
          disabled={uploading || !bothSelected}
          style={styles.button}
        />
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
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  loader: {
    marginVertical: theme.spacing.sm,
  },
  serverSection: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.sm,
  },
  serverSectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  serverSideBlock: {
    gap: theme.spacing.sm,
  },
  serverSideLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  serverFileMeta: {
    flex: 1,
    gap: 2,
  },
  reviewComment: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  viewLink: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.semibold,
  },
  sideSection: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.sm,
  },
  sideTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  preview: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    height: 140,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  previewIcon: {
    fontSize: 40,
  },
  previewText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  fileList: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    resizeMode: 'cover',
  },
  thumbFile: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: {
    fontSize: 24,
  },
  fileRowName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  removeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    fontWeight: theme.fontWeight.semibold,
  },
  options: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.sm,
  },
  option: {
    height: 64,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  limitNote: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  button: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
});
