import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { theme } from '../theme';
import { compressImage } from '../utils/image';
import { uploadPhotoToBackend } from '../utils/upload';

interface ValidationErrors {
  firstName?: string;
  lastName?: string;
}

const MIN_PHONE_DIGITS = 10;

function formatPhone(digits: string): string {
  if (digits.length === 0) return '';
  let result = digits[0];
  if (digits.length > 1) result += ` ${digits.slice(1, Math.min(digits.length, 3))}`;
  if (digits.length > 3) result += ` ${digits.slice(3, Math.min(digits.length, 7))}`;
  if (digits.length > 7) result += `-${digits.slice(7, 11)}`;
  return result;
}

const validateName = (value: string) => {
  if (!value.trim()) return undefined;
  if (value.length > 100) return 'Maximo 100 caracteres';
  if (/\d/.test(value)) return 'No puede contener numeros';
  return undefined;
};

const isFormValid = (
  firstName: string,
  lastName: string,
  phoneDigits: string,
  termsAccepted: boolean,
) => {
  return (
    firstName.trim() !== '' &&
    !validateName(firstName) &&
    lastName.trim() !== '' &&
    !validateName(lastName) &&
    phoneDigits.length >= MIN_PHONE_DIGITS &&
    termsAccepted
  );
};

export const OnboardingStep1Screen: React.FC = () => {
  const navigation = useAppNavigation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');
  const profileLoaded = useRef(false);

  useEffect(() => {
    if (profileLoaded.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await apiClient.get('/drivers/me');
        if (cancelled || !data?.full_name) return;

        const nameParts = (data.full_name as string).split(' ');
        const fn = nameParts[0] ?? '';
        const ln = nameParts.slice(1).join(' ') ?? '';

        const phone: string = data.phone ?? '';
        const digits = phone.startsWith('+54')
          ? phone.slice(3).replace(/\D/g, '')
          : phone.replace(/\D/g, '');

        setFirstName(fn);
        setLastName(ln);
        if (digits) setPhoneDigits(digits);
        if (data.avatar_url) setPhotoUri(data.avatar_url as string);
        profileLoaded.current = true;
      } catch {
        // Silently ignore — the form stays empty, user fills it manually
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setError = (field: keyof ValidationErrors, error: string | undefined) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galeria para agregar una foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      try {
        const compressed = await compressImage(asset.uri);
        setPhotoUri(compressed.uri);
      } catch (err) {
        console.warn('Image compression failed, using original:', err);
        setPhotoUri(asset.uri);
      }
    }
  };

  const handleContinue = async () => {
    if (!isFormValid(firstName, lastName, phoneDigits, termsAccepted)) return;
    setLoading(true);
    setSubmitError('');

    try {
      let uploadedPhotoUrl: string | null = null;

      if (photoUri) {
        try {
          const result = await uploadPhotoToBackend(photoUri, 'avatar.jpg', 'image/jpeg');
          uploadedPhotoUrl = result.file_url;
        } catch (err) {
          console.error('Photo upload error:', err);
        }
      }

      const payload: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: `+54${phoneDigits}`,
      };

      if (uploadedPhotoUrl) {
        payload.photo_url = uploadedPhotoUrl;
      }

      const { data } = await apiClient.put('/drivers/me', payload);

      const step: string = data?.step ?? 'kyc';
      const target = STEP_ROUTE[step];
      if (target) {
        navigation.replace(target.screen);
      } else {
        navigation.navigate('KYCVerify');
      }
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Error al guardar los datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 1/3" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <TouchableOpacity style={styles.avatarSection} onPress={pickImage} activeOpacity={0.7}>
            <View style={styles.avatarCircle}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarIcon}>📷</Text>
              )}
            </View>
            <Text style={styles.avatarLabel}>Agregar foto</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>PERFIL</Text>
          <Input
            placeholder="Nombre"
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              setError('firstName', undefined);
            }}
            onBlur={() => setError('firstName', validateName(firstName))}
            error={errors.firstName}
            containerStyle={styles.input}
            maxLength={100}
          />
          <Input
            placeholder="Apellido"
            value={lastName}
            onChangeText={(t) => {
              setLastName(t);
              setError('lastName', undefined);
            }}
            onBlur={() => setError('lastName', validateName(lastName))}
            error={errors.lastName}
            containerStyle={styles.input}
            maxLength={100}
          />
          <Input
            leftElement={<Text style={styles.countryCode}>+54</Text>}
            placeholder="9 XX XXXX-XXXX"
            value={formatPhone(phoneDigits)}
            onChangeText={(t) => setPhoneDigits(t.replace(/\D/g, '').slice(0, 11))}
            keyboardType="phone-pad"
            containerStyle={styles.input}
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>Acepto los terminos y condiciones</Text>
          </TouchableOpacity>

          {submitError !== '' && <Text style={styles.submitError}>{submitError}</Text>}

          <Button
            title="CONTINUAR"
            onPress={handleContinue}
            disabled={!isFormValid(firstName, lastName, phoneDigits, termsAccepted)}
            loading={loading}
            variant="cta"
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.sm,
  },
  avatarSection: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarIcon: {
    fontSize: 32,
    color: theme.colors.mediumGray,
  },
  avatarLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  input: {
    width: 343,
  },
  countryCode: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: 343,
    marginTop: theme.spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.turquoise,
    borderColor: theme.colors.turquoise,
  },
  checkboxLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  submitError: {
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
