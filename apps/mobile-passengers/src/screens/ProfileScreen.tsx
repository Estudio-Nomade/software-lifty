import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getProfile, updateProfile, uploadProfilePhoto } from '../api/passenger';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { buildSosWhatsAppUrl } from '../lib/supportContact';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme';
import { compressImage } from '../utils/image';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export function ProfileScreen() {
  const { goBack, navigate } = useAppNavigation();
  const { signOut } = useAuth();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const setFullName = useAuthStore((s) => s.setFullName);
  const activeTrip = useRideStore((s) => s.activeTrip);
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setPhone(profile.phone ?? '');
        setAvatarUrl(profile.avatar_url ?? null);
        if (profile.full_name) setFullName(profile.full_name);
      })
      .catch(() => {});
  }, [setFullName]);

  const displayName = fullName || email?.split('@')[0] || 'Usuario';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } catch {
      setLoggingOut(false);
    }
  };

  const openEdit = () => {
    setEditFullName(fullName ?? '');
    setEditPhone(phone);
    setEditPhotoUri(null);
    setEditVisible(true);
  };

  const handlePickPhoto = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'No disponible',
        'Cambiar la foto de perfil solo está disponible en el dispositivo (Expo Go).',
      );
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería para cambiar tu foto.');
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
    setSaving(true);
    try {
      if (editPhotoUri) {
        const compressed = await compressImage(editPhotoUri);
        const uploadResult = await uploadProfilePhoto(compressed.uri, 'avatar.jpg', 'image/jpeg');
        setAvatarUrl(uploadResult.avatar_url ?? uploadResult.file_url);
      }

      const updated = await updateProfile({
        full_name: editFullName.trim(),
        phone: editPhone.trim(),
      });
      if (updated.full_name) setFullName(updated.full_name);
      setPhone(updated.phone ?? '');
      if (updated.avatar_url) setAvatarUrl(updated.avatar_url);
      setEditVisible(false);
      setEditPhotoUri(null);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil. Revisá la conexión e intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const primaryMenu: MenuItem[] = [
    {
      icon: 'create-outline',
      label: 'Editar perfil',
      onPress: openEdit,
    },
    {
      icon: 'card-outline',
      label: 'Métodos de pago',
      onPress: () => navigate('PaymentMethod'),
    },
    {
      icon: 'time-outline',
      label: 'Historial de viajes',
      onPress: () => navigate('TripHistory'),
    },
  ];

  const secondaryMenu: MenuItem[] = [
    {
      icon: 'document-text-outline',
      label: 'Términos y condiciones',
      onPress: () => navigate('Terms', { from: 'profile' }),
    },
    {
      icon: 'help-circle-outline',
      label: 'Soporte',
      onPress: () => navigate('Support'),
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'SOS',
      onPress: () => Linking.openURL(buildSosWhatsAppUrl({ fullName, trip: activeTrip })),
      danger: true,
    },
  ];

  const renderMenuItem = (item: MenuItem) => (
    <TouchableOpacity
      key={item.label}
      style={styles.menuItem}
      onPress={item.onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.menuIcon, item.danger && styles.menuIconDanger]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={item.danger ? theme.colors.dangerRed : theme.colors.deepBlue}
        />
      </View>
      <Text style={[styles.menuText, item.danger && styles.menuTextDanger]}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
    </TouchableOpacity>
  );

  const previewUri = editPhotoUri ?? avatarUrl;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Perfil</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <Avatar uri={avatarUrl} name={displayName} size={80} />
          <Text style={styles.name}>{fullName || displayName}</Text>
          {email && <Text style={styles.email}>{email}</Text>}
        </View>

        <View style={styles.menuGroup}>{primaryMenu.map(renderMenuItem)}</View>

        <View style={styles.menuGroup}>{secondaryMenu.map(renderMenuItem)}</View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.colors.dangerRed} />
          <Text style={styles.logoutText}>
            {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </Text>
        </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.editAvatar}
                onPress={handlePickPhoto}
                activeOpacity={0.7}
              >
                <Avatar uri={previewUri} name={editFullName || displayName} size={72} />
                <Text style={styles.editAvatarLabel}>Cambiar foto</Text>
              </TouchableOpacity>

              <Input placeholder="Nombre" value={editFullName} onChangeText={setEditFullName} />
              <Input
                placeholder="Teléfono"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
              <View style={styles.emailRow}>
                <Text style={styles.emailLabel}>Email</Text>
                <Text style={styles.emailValue}>{email ?? '—'}</Text>
              </View>

              <Button onPress={handleSave} loading={saving} disabled={saving}>
                Guardar
              </Button>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  profileSection: {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  name: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  email: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  menuGroup: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconDanger: {
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
  },
  menuText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  menuTextDanger: {
    color: theme.colors.dangerRed,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dangerRed,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
  },
  logoutText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.dangerRed,
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
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  editAvatar: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  editAvatarLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  emailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  emailLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  emailValue: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
});
