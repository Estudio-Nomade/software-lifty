import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import type { DocBase, DocSide } from '../utils/upload';
import { DOC_SIDES, reuploadDocumentToBackend, uploadDocumentToBackend } from '../utils/upload';

type DocType = DocBase;

const SIDE_LABELS: Record<DocSide, string> = { front: 'Frente', back: 'Dorso' };

type SelectedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export const UploadDocumentScreen: React.FC = () => {
  const { docType, docLabel, mode } = useLocalSearchParams<{
    docType: DocType;
    docLabel: string;
    mode?: string;
  }>();
  const router = useRouter();

  const isReupload = mode === 'reupload';

  const [selectedFiles, setSelectedFiles] = useState<Record<DocSide, SelectedFile | null>>({
    front: null,
    back: null,
  });
  const [uploading, setUploading] = useState(false);
  const requiredSides = docType ? DOC_SIDES[docType] : [];
  const bothSelected = requiredSides.every((side) => selectedFiles[side] !== null);

  const title = docLabel || 'Subir documento';

  const handleCamera = async (side: DocSide) => {
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
      setSelectedFiles((prev) => ({
        ...prev,
        [side]: {
          uri: asset.uri,
          name: `photo-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          size: asset.fileSize,
        },
      }));
    }
  };

  const handleGallery = async (side: DocSide) => {
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
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const extension = asset.uri.split('.').pop() || 'jpg';
      setSelectedFiles((prev) => ({
        ...prev,
        [side]: {
          uri: asset.uri,
          name: `image-${Date.now()}.${extension}`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        },
      }));
    }
  };

  const handleUpload = async () => {
    if (!bothSelected || !docType) return;

    setUploading(true);
    try {
      let requiresReview = false;
      for (const side of requiredSides) {
        const file = selectedFiles[side];
        if (!file) continue;

        let uploadUri = file.uri;
        let uploadName = file.name;
        let uploadMimeType = file.mimeType || 'application/octet-stream';

        if (uploadMimeType.startsWith('image/')) {
          try {
            const compressed = await compressImage(uploadUri);
            uploadUri = compressed.uri;
            uploadName = uploadName.replace(/\.[^.]+$/, '.jpg');
            uploadMimeType = 'image/jpeg';
          } catch {}
        }

        if (isReupload) {
          const result = await reuploadDocumentToBackend(
            uploadUri,
            uploadName,
            uploadMimeType,
            docType,
            side,
          );
          requiresReview = requiresReview || result.requires_review;
        } else {
          await uploadDocumentToBackend(uploadUri, uploadName, uploadMimeType, docType, side);
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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title={title} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {isReupload
            ? 'Al reemplazar este documento, quedara pendiente de revision.'
            : 'Subi el documento requerido'}
        </Text>

        {requiredSides.map((side) => {
          const file = selectedFiles[side];
          const isImage = file?.mimeType?.startsWith('image/');
          const label = SIDE_LABELS[side];
          return (
            <View key={side} style={styles.sideSection}>
              <Text style={styles.sideTitle}>{label}</Text>
              <View style={styles.preview}>
                {file ? (
                  isImage ? (
                    <Image source={{ uri: file.uri }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.previewFile}>
                      <Text style={styles.previewIcon}>📄</Text>
                      <Text style={styles.previewFileName} numberOfLines={2}>
                        {file.name}
                      </Text>
                    </View>
                  )
                ) : (
                  <>
                    <Text style={styles.previewIcon}>📄</Text>
                    <Text style={styles.previewText}>Todavia no subiste nada</Text>
                  </>
                )}
              </View>

              {file ? (
                <Button
                  title="CAMBIAR ARCHIVO"
                  variant="secondary"
                  onPress={() => setSelectedFiles((prev) => ({ ...prev, [side]: null }))}
                  style={styles.button}
                />
              ) : (
                <View style={styles.options}>
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleCamera(side)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>📷 Sacar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleGallery(side)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>🖼 Subir de galeria</Text>
                  </TouchableOpacity>
                </View>
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
    backgroundColor: theme.colors.white,
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
  sideSection: {
    width: 343,
    gap: theme.spacing.sm,
  },
  sideTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  preview: {
    width: 343,
    height: 140,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewFile: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  previewIcon: {
    fontSize: 40,
  },
  previewText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  previewFileName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  options: {
    width: 343,
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
  button: {
    width: 343,
  },
});
