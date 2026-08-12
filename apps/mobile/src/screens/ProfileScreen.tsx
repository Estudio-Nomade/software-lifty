import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { apiClient, getValidated } from '../api/client';
import { type DriverDocument, documentSchema } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { SideMenu } from '../components/SideMenu';
import { Text } from '../components/ui/Text';
import { useTabBar } from '../context/TabBarContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { uploadPhotoToBackend } from '../utils/upload';

interface ProfileData {
  id: string;
  phone: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  kyc_status: string | null;
  rating_avg: number;
  total_trips: number;
  completion_rate: number;
  is_online: boolean;
  documents_pending_review?: boolean;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    color: string;
    plate: string;
    vehicle_type: string;
  } | null;
  created_at: string;
}

// Maps a backend doc_type back to the UploadDocument screen's docType param.
const DOC_TYPE_TO_UPLOAD: Record<string, string> = {
  license_front: 'drivers_license',
  license_back: 'drivers_license',
  registration_front: 'vehicle_registration',
  registration_back: 'vehicle_registration',
  insurance_front: 'vehicle_insurance',
  insurance_back: 'vehicle_insurance',
  background_check_front: 'background_check',
  background_check_back: 'background_check',
  rndg_front: 'rndg',
};

// The documents a driver can manage from the profile.
const MANAGEABLE_DOCS: { docType: string; label: string }[] = [
  { docType: 'drivers_license', label: 'Licencia de conducir' },
  { docType: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { docType: 'vehicle_insurance', label: 'Seguro del vehiculo' },
  { docType: 'background_check', label: 'Certificado de antecedentes penales' },
  { docType: 'rndg', label: 'Registro Nacional de Datos Geneticos (RNDG)' },
];

function docsStatusLabel(docs: DriverDocument[]): string {
  if (docs.length === 0) return 'No cargado';
  if (docs.some((d) => d.status === 'rejected')) return 'Rechazado';
  if (docs.some((d) => d.status === 'pending_review')) return 'Pendiente de revision';
  if (docs.every((d) => d.status === 'approved' || !!d.verified_at)) return 'Verificado';
  return 'Pendiente';
}

function docsStatusIcon(docs: DriverDocument[]): React.JSX.Element {
  if (docs.length === 0) {
    return <Ionicons name="add-circle-outline" size={18} color={theme.colors.mediumGray} />;
  }
  if (docs.some((d) => d.status === 'rejected')) {
    return <Ionicons name="close-circle-outline" size={18} color={theme.colors.dangerRed} />;
  }
  if (docs.every((d) => d.status === 'approved' || !!d.verified_at)) {
    return <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.turquoise} />;
  }
  if (docs.some((d) => d.status === 'pending_review')) {
    return <Ionicons name="time-outline" size={18} color={theme.colors.amber} />;
  }
  return <Ionicons name="time-outline" size={18} color={theme.colors.amber} />;
}

export const ProfileScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const signOut = useSignOut();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const { setActiveTab } = useTabBar();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, docsRes] = await Promise.all([
        apiClient.get('/drivers/me'),
        getValidated('/drivers/me/documents', z.array(documentSchema)),
      ]);
      setProfile(profileRes.data);
      setDocuments(docsRes);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleSignOut = () => {
    signOut.mutate();
  };

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: 'home-outline' as const,
        onPress: () => navigation.navigate(isOnline ? 'Active' : 'Online'),
      },
      {
        label: 'Ganancias',
        icon: 'wallet-outline' as const,
        onPress: () => navigation.navigate('Earnings'),
      },
      {
        label: 'Metodo de cobro',
        icon: 'card-outline' as const,
        onPress: () => navigation.navigate('PaymentMethod'),
      },
      {
        label: 'Perfil',
        icon: 'person-outline' as const,
        onPress: () => {},
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

  const openEdit = () => {
    if (!profile) return;
    const parts = (profile.full_name ?? '').split(' ');
    setEditFirstName(parts[0] ?? '');
    setEditLastName(parts.slice(1).join(' ') ?? '');
    setEditPhone(profile.phone ?? '');
    setEditPhotoUri(null);
    setEditVisible(true);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setEditPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      let photoUrl = profile.avatar_url;

      if (editPhotoUri) {
        const compressed = await compressImage(editPhotoUri);
        const uploadResult = await uploadPhotoToBackend(compressed.uri, 'avatar.jpg', 'image/jpeg');
        photoUrl = uploadResult.file_url;
      }

      await apiClient.put('/drivers/me', {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim(),
        photo_url: photoUrl,
      });

      setEditVisible(false);
      await fetchData();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
        <Navbar title="Perfil" showHamburger onHamburgerPress={() => setMenuVisible(true)} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      </View>
    );
  }

  const vehicleText = profile?.vehicle
    ? `${profile.vehicle.brand} ${profile.vehicle.model} ${profile.vehicle.year} · ${profile.vehicle.plate}`
    : 'Sin vehiculo registrado';

  const sinceYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;
  const yearsActive = sinceYear ? new Date().getFullYear() - sinceYear : 0;

  const formatTier = (value: number, tiers: number[]): string => {
    const hit = tiers.filter((t) => value >= t).pop();
    return hit != null ? `${hit}+` : String(value);
  };

  const tripsDisplay = formatTier(profile?.total_trips ?? 0, [100, 500, 1000, 5000, 10000]);
  const yearsDisplay = formatTier(yearsActive, [1, 3, 5, 10]);
  const yearsLabel = yearsActive >= 1 ? 'Año' : 'Años';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Perfil" showHamburger onHamburgerPress={() => setMenuVisible(true)} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard} padding={theme.spacing.lg}>
          <View style={styles.avatar}>
            <Avatar uri={profile?.avatar_url ?? null} name={profile?.full_name ?? ''} size={72} />
          </View>
          <Text style={styles.name}>{profile?.full_name || 'Sin nombre'}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{tripsDisplay}</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.stat}>
              <View style={styles.ratingRow}>
                <Text style={styles.statValue}>
                  {profile?.rating_avg ? profile.rating_avg.toFixed(1) : '-'}
                </Text>
                <Ionicons name="star" size={14} color={theme.colors.amber} />
              </View>
              <Text style={styles.statLabel}>Calificación</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{yearsDisplay}</Text>
              <Text style={styles.statLabel}>{yearsLabel}</Text>
            </View>
          </View>
          <Button title="EDITAR PERFIL" variant="outline" onPress={openEdit} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Contacto</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Telefono</Text>
            <Text style={styles.infoValue}>{profile?.phone || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile?.email || '-'}</Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Mi vehiculo</Text>
          <Text style={styles.vehicleInfo}>{vehicleText}</Text>
          {profile?.vehicle && <Text style={styles.vehicleColor}>{profile.vehicle.color}</Text>}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Documentos</Text>
          {profile?.documents_pending_review && (
            <View style={styles.reviewBanner}>
              <Text style={styles.reviewBannerText}>
                Tenes documentos pendientes de revision. No podras conectarte hasta que un
                administrador los apruebe.
              </Text>
            </View>
          )}
          {MANAGEABLE_DOCS.map((managed) => {
            const docsFor = documents.filter(
              (d) => DOC_TYPE_TO_UPLOAD[d.doc_type] === managed.docType,
            );
            return (
              <View key={managed.docType} style={styles.docRow}>
                {docsStatusIcon(docsFor)}
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{managed.label}</Text>
                  <Text style={styles.docStatus}>{docsStatusLabel(docsFor)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('UploadDocument', {
                      docType: managed.docType,
                      docLabel: managed.label,
                      mode: 'reupload',
                    })
                  }
                >
                  <Text style={styles.docAction}>
                    {docsFor.length > 0 ? 'Volver a subir' : 'Subir'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </Card>

        <Button
          title="Cerrar sesion"
          variant="danger"
          onPress={handleSignOut}
          style={styles.button}
          textStyle={{ color: theme.colors.dangerRed, fontWeight: theme.fontWeight.medium }}
        />
      </ScrollView>

      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar perfil</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <TouchableOpacity style={styles.editAvatar} onPress={handlePickPhoto}>
                <Avatar
                  uri={editPhotoUri ?? profile?.avatar_url ?? null}
                  name={profile?.full_name ?? ''}
                  size={80}
                />
                <Text style={styles.editAvatarLabel}>Cambiar foto</Text>
              </TouchableOpacity>

              <Input
                placeholder="Nombre"
                value={editFirstName}
                onChangeText={setEditFirstName}
                containerStyle={styles.editInput}
              />
              <Input
                placeholder="Apellido"
                value={editLastName}
                onChangeText={setEditLastName}
                containerStyle={styles.editInput}
              />
              <Input
                placeholder="Telefono"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
                containerStyle={styles.editInput}
              />

              <Button
                title="GUARDAR"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                style={styles.editButton}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SideMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        userName={profile?.full_name}
        avatarUrl={profile?.avatar_url ?? null}
        menuItems={menuItems}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    paddingBottom: theme.dimensions.tabBarHeight + theme.spacing['2xl'],
  },
  profileCard: {
    width: 343,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: theme.spacing.sm,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  infoValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontWeight: theme.fontWeight.medium,
  },
  vehicleInfo: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  vehicleColor: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginTop: 4,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  docStatus: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  docAction: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  reviewBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  reviewBannerText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
  },
  button: {
    width: 327,
    borderColor: theme.colors.dangerRed,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    maxHeight: '90%',
  },
  modalScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  editAvatar: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  editAvatarLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  editInput: {
    width: '100%',
  },
  editButton: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
});
