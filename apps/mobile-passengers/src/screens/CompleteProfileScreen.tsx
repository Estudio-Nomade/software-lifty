import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProfile, registerPassenger, updateProfile } from '../api/passenger';
import { AuthFormCard, AuthFormChrome } from '../components/AuthFormChrome';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  isPassengerPhoneComplete,
  isPassengerProfileComplete,
  joinFullName,
  splitGoogleName,
  writePassengerProfileCompleteCache,
} from '../lib/passengerProfileGate';
import { getFriendlyProfileError } from '../lib/profileErrors';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function CompleteProfileScreen() {
  const { navigate, replace } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const emailFromStore = useAuthStore((s) => s.email);
  const userId = useAuthStore((s) => s.userId);
  const setFullName = useAuthStore((s) => s.setFullName);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(emailFromStore ?? '');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [{ data }, profile] = await Promise.all([
          supabase.auth.getUser(),
          getProfile().catch(() => null),
        ]);
        if (cancelled) return;

        const meta = data.user?.user_metadata as
          | {
              given_name?: string;
              family_name?: string;
              full_name?: string;
              name?: string;
              phone?: string;
              phone_number?: string;
            }
          | undefined;

        const fromMeta = splitGoogleName(meta);
        const fromProfile = splitGoogleName({
          full_name: profile?.full_name ?? undefined,
        });

        setFirstName(fromProfile.firstName || fromMeta.firstName);
        setLastName(fromProfile.lastName || fromMeta.lastName);
        setEmail(profile?.email || data.user?.email || emailFromStore || '');
        setPhone(profile?.phone?.trim() || meta?.phone?.trim() || meta?.phone_number?.trim() || '');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emailFromStore]);

  const fullName = joinFullName(firstName, lastName);
  const isValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    isPassengerPhoneComplete(phone) &&
    accepted;

  const handleSubmit = async () => {
    if (!isValid || loading) {
      setError('Completá nombre, apellido, teléfono y aceptá los términos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let updated = await updateProfile({
        full_name: fullName,
        phone: phone.trim(),
      }).catch(() => null);

      if (!updated) {
        updated = await registerPassenger(phone.trim(), fullName);
      }

      if (!isPassengerProfileComplete(updated)) {
        setError('No se pudo guardar nombre y teléfono. Revisá los datos e intentá de nuevo.');
        return;
      }
      if (updated.full_name) setFullName(updated.full_name);
      // Only mark complete after server payload passes the same gate as the watcher.
      if (userId) writePassengerProfileCompleteCache(userId, true);
      replace('LocationPermissions');
    } catch (err) {
      setError(getFriendlyProfileError(err));
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <View style={styles.form}>
      <AuthFormChrome
        brand="Lifty"
        title="Completá tu perfil"
        subtitle="Confirmá tus datos para seguir"
      />

      <AuthFormCard>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nombre</Text>
          <Input
            placeholder="Nombre"
            value={firstName}
            onChangeText={setFirstName}
            autoFocus={!booting}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Apellido</Text>
          <Input placeholder="Apellido" value={lastName} onChangeText={setLastName} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={() => {}}
            keyboardType="email-address"
            disabled
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Teléfono</Text>
          <Input
            placeholder="Ej. 11 1234 5678"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Pressable
          style={styles.termsRow}
          onPress={() => setAccepted(!accepted)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.termsText}>
            Acepto{' '}
            <Text style={styles.termsLink} onPress={() => navigate('Terms', { from: 'profile' })}>
              términos y condiciones
            </Text>
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AuthFormCard>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      {/*
        Android: ScrollView only — no KeyboardAvoidingView (grey band above keyboard).
      */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: theme.spacing.md }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        {form}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
        <Button
          variant="primary"
          onPress={handleSubmit}
          loading={loading || booting}
          disabled={!isValid || loading || booting}
        >
          Continuar
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  form: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  fieldGroup: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  termsText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    flex: 1,
  },
  termsLink: {
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    fontFamily: theme.fontFamily.regular,
  },
  footer: {
    backgroundColor: theme.colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
});
