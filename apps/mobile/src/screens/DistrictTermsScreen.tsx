import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { stripHtml } from '../lib/stripHtml';
import { theme } from '../theme';

export const DistrictTermsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { districtId, districtName } = useLocalSearchParams<{
    districtId: string;
    districtName: string;
  }>();

  const [terms, setTerms] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!districtId) return;
    try {
      setLoading(true);
      const { data: body } = await apiClient.get(`/districts/${districtId}`);
      const payload = body?.data ?? body;
      setTerms(payload.terms_and_conditions);
      setPrivacy(payload.privacy_policy);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los términos del municipio');
    } finally {
      setLoading(false);
    }
  }, [districtId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAccept = async () => {
    if (!districtId) return;
    try {
      setSubmitting(true);
      await apiClient.put('/drivers/me/district', { district_id: districtId });
      navigation.replace('Active');
    } catch (err: any) {
      const message =
        err?.error?.message ??
        err?.message ??
        'No se pudo confirmar el municipio. Intentá de nuevo.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Navbar title={districtName ?? 'Términos'} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Navbar title={districtName ?? 'Términos'} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Términos y Condiciones</Text>
            <Text style={styles.sectionText}>{stripHtml(terms)}</Text>
          </View>
        ) : null}
        {privacy ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Política de Privacidad</Text>
            <Text style={styles.sectionText}>{stripHtml(privacy)}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title="Aceptar y continuar"
          variant="cta"
          onPress={handleAccept}
          loading={submitting}
          disabled={submitting}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.deepBlue,
  },
  sectionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    lineHeight: 24,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
});
