import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  GENERAL_TERMS_SUMMARY,
  GENERAL_TERMS_UPDATED_LABEL,
  GENERAL_TERMS_VERSION,
} from '../legal/generalTermsSummary';
import { isTransientStatusFailure, resolvePostAuthRoute } from '../lib/postAuthRouting';
import { isTermsReadMode } from '../lib/termsReadMode';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const TermsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const params = useLocalSearchParams<{ from?: string }>();
  const setTermsAccepted = useAuthStore((s) => s.setTermsAccepted);
  const termsAccepted = useAuthStore((s) => s.termsAccepted);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isReadMode = isTermsReadMode({ from: params.from, termsAccepted });

  const handleAccept = async () => {
    if (isReadMode) {
      navigation.goBack();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const route = await resolvePostAuthRoute();
      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      setTermsAccepted(true);
      if (route.screen) {
        navigation.replace(route.screen);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al verificar tu cuenta';
      setError(message);
      if (isTransientStatusFailure(err)) {
        useAuthStore.getState().clearAuthState();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar
        title="Terminos y Condiciones"
        onBack={() => navigation.goBack()}
        backgroundColor={theme.colors.deepBlue}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>TERMINOS Y CONDICIONES</Text>
        <Text style={styles.subtitle}>
          {GENERAL_TERMS_UPDATED_LABEL} · v{GENERAL_TERMS_VERSION}
        </Text>

        {GENERAL_TERMS_SUMMARY.map((block) => (
          <View key={block.heading ?? block.body.slice(0, 24)} style={styles.block}>
            {block.heading ? <Text style={styles.heading}>{block.heading}</Text> : null}
            <Text style={block.heading ? styles.body : styles.notice}>{block.body}</Text>
          </View>
        ))}

        <View style={{ height: 48 }} />
      </ScrollView>
      <View style={styles.footer}>
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
        <Button
          title={isReadMode ? 'VOLVER' : loading ? '' : 'ACEPTAR Y CONTINUAR'}
          onPress={handleAccept}
          loading={!isReadMode && loading}
          disabled={!isReadMode && loading}
          variant={isReadMode ? 'outline' : 'primary'}
          style={styles.button}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.lg,
  },
  block: {
    marginBottom: theme.spacing.sm,
  },
  heading: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 22,
  },
  notice: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 22,
    fontWeight: theme.fontWeight.medium,
    marginBottom: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  button: {
    width: 327,
  },
});
