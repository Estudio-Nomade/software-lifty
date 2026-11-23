import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  GENERAL_TERMS_SUMMARY,
  GENERAL_TERMS_UPDATED_LABEL,
  GENERAL_TERMS_VERSION,
} from '../legal/generalTermsSummary';
import { postLegalAccept } from '../legal/legalConsent';
import {
  PRIVACY_POLICY_LABEL,
  PRIVACY_POLICY_URL,
  TERMS_FULL_LABEL,
  TERMS_URL,
} from '../legal/legalUrls';
import { resolvePassengerPostAuthPath } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

async function openLegalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir el enlace', 'Revisá tu conexión e intentá de nuevo.');
  }
}

export function TermsScreen() {
  const { goBack, replace } = useAppNavigation();
  const params = useLocalSearchParams<{ from?: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const termsAccepted = useAuthStore((s) => s.termsAccepted);
  const setTermsAccepted = useAuthStore((s) => s.setTermsAccepted);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromProfile = params.from === 'profile';
  const fromRegister = params.from === 'register';
  // Read mode: profile, or already accepted current versions while authed.
  const isReadMode = fromProfile || (isAuthenticated && termsAccepted);

  const handleAccept = async () => {
    if (isReadMode) {
      goBack();
      return;
    }
    if (!hasAgreed || loading) return;

    // Unauthenticated register preview: checkbox gates CTA; durable accept is post-login.
    if (!isAuthenticated) {
      if (fromRegister) {
        replace('LoginCredentials');
      } else {
        goBack();
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await postLegalAccept();
      setTermsAccepted(true);
      const path = await resolvePassengerPostAuthPath(useAuthStore.getState().userId);
      if (path === '/complete-profile') replace('CompleteProfile');
      else if (path === '/location-permissions') replace('LocationPermissions');
      else if (path === '/home') replace('Home');
      else if (fromRegister) replace('LoginCredentials');
      else goBack();
    } catch {
      setError('No pudimos registrar tu aceptación. Revisá conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={goBack}>
          ←
        </Text>
        <Text style={styles.title}>Términos y condiciones</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Card padding="lg">
          <Text style={styles.version}>
            {GENERAL_TERMS_UPDATED_LABEL} · v{GENERAL_TERMS_VERSION}
          </Text>
          {GENERAL_TERMS_SUMMARY.map((block) => (
            <View key={block.heading ?? block.body.slice(0, 24)}>
              {block.heading ? <Text style={styles.paragraphHeading}>{block.heading}</Text> : null}
              <Text style={[styles.paragraph, !block.heading && styles.paragraphIntro]}>
                {block.body}
              </Text>
            </View>
          ))}

          <View style={styles.legalLinks}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={PRIVACY_POLICY_LABEL}
              onPress={() => {
                void openLegalUrl(PRIVACY_POLICY_URL);
              }}
              style={styles.legalLink}
            >
              <Text style={styles.legalLinkText}>Ver {PRIVACY_POLICY_LABEL}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={TERMS_FULL_LABEL}
              onPress={() => {
                void openLegalUrl(TERMS_URL);
              }}
              style={styles.legalLink}
            >
              <Text style={styles.legalLinkText}>Ver {TERMS_FULL_LABEL}</Text>
            </Pressable>
          </View>

          {!isReadMode ? (
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setHasAgreed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasAgreed }}
              accessibilityLabel="He leído y acepto los Términos y Condiciones y la Política de Privacidad"
            >
              <View style={[styles.checkbox, hasAgreed && styles.checkboxChecked]}>
                {hasAgreed ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                He leído y acepto los{' '}
                <Text
                  style={styles.inlineLink}
                  onPress={() => {
                    void openLegalUrl(TERMS_URL);
                  }}
                >
                  Términos y Condiciones
                </Text>{' '}
                y la{' '}
                <Text
                  style={styles.inlineLink}
                  onPress={() => {
                    void openLegalUrl(PRIVACY_POLICY_URL);
                  }}
                >
                  Política de Privacidad
                </Text>
                .
              </Text>
            </Pressable>
          ) : null}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button
          variant={isReadMode ? 'secondary' : 'primary'}
          onPress={() => {
            void handleAccept();
          }}
          loading={!isReadMode && loading}
          disabled={!isReadMode && (!hasAgreed || loading)}
        >
          {isReadMode ? 'Volver' : 'Continuar'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.white,
    gap: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  back: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: '700',
    padding: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
  },
  version: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    marginBottom: theme.spacing.md,
  },
  paragraph: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  paragraphIntro: {
    fontFamily: theme.fontFamily.medium,
    marginBottom: theme.spacing.md,
  },
  paragraphHeading: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  legalLinks: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.md,
  },
  legalLink: {
    paddingVertical: theme.spacing.xs,
  },
  legalLinkText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  footer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
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
  checkboxLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    lineHeight: 20,
  },
  inlineLink: {
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
    textDecorationLine: 'underline',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
});
