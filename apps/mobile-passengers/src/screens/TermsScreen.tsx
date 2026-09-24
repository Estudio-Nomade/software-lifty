import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  GENERAL_TERMS_SUMMARY,
  GENERAL_TERMS_UPDATED_LABEL,
  GENERAL_TERMS_VERSION,
} from '../legal/generalTermsSummary';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function TermsScreen() {
  const { goBack, replace } = useAppNavigation();
  const params = useLocalSearchParams<{ from?: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [accepted, setAccepted] = useState(false);

  const fromProfile = params.from === 'profile';
  const fromRegister = params.from === 'register';
  const isReadMode = fromProfile || isAuthenticated;

  const handleAccept = () => {
    if (isReadMode || isAuthenticated) {
      goBack();
      return;
    }
    if (accepted) return;
    setAccepted(true);
    if (fromRegister) {
      replace('LoginCredentials');
    } else {
      goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant={isReadMode ? 'secondary' : accepted ? 'secondary' : 'primary'}
          onPress={handleAccept}
          loading={!isReadMode && accepted}
        >
          {isReadMode ? 'Volver' : accepted ? 'Redirigiendo...' : 'Aceptar'}
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
  footer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
});
