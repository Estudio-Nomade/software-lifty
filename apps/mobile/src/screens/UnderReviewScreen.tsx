import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { apiClient, getValidated } from '../api/client';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const UnderReviewScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const hasNavigated = useRef(false);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [showApproved, setShowApproved] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const kycSessionId = useAuthStore((s) => s.kycSessionId);
  const setKycSessionId = useAuthStore((s) => s.setKycSessionId);
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);

  const { data, failureCount, refetch } = useQuery({
    queryKey: ['driverStatus'],
    queryFn: async () => {
      if (kycSessionId) {
        try {
          await apiClient.get(`/kyc/decision/${kycSessionId}`);
        } catch {
          // best-effort
        }
      }
      const statusData = await getValidated('/drivers/me/status', driverStatusSchema);
      return statusData;
    },
    refetchInterval: 10_000,
    retry: 3,
  });

  useEffect(() => {
    if (!data || hasNavigated.current) return;

    setDriverStatus(data.status);
    setOnboardingStep(data.step ?? null);

    if (data.status === 'approved') {
      hasNavigated.current = true;
      setKycSessionId(null);
      setShowApproved(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => {
        navigation.replace('Online');
      }, 1500);
      return () => clearTimeout(timer);
    }

    if (data.status === 'rejected') {
      hasNavigated.current = true;
      setKycSessionId(null);

      // Different rejection paths: KYC identity vs document review
      if (data.step === 'kyc') {
        // KYC (identity) rejection — go back to identity verification
        setRejectedMessage('Tu verificacion de identidad fue rechazada.');
        if (data.admin_review_notes) {
          setRejectedReason(data.admin_review_notes);
        }
      } else {
        // Document rejection — go back to document upload
        setRejectedMessage('Tus documentos fueron rechazados.');
        if (data.admin_review_notes) {
          setRejectedReason(data.admin_review_notes);
        }
      }
      return;
    }

    // KYC just got approved → advance to next step
    if (data.step && data.step !== 'review' && data.step !== 'kyc') {
      const route = STEP_ROUTE[data.step];
      if (route?.screen) {
        hasNavigated.current = true;
        setKycSessionId(null);
        navigation.navigate(route.screen);
      }
    }
  }, [data, navigation, setKycSessionId, setDriverStatus, setOnboardingStep, fadeAnim]);

  useEffect(() => {
    if (!__DEV__) return;
    if (hasNavigated.current) return;

    const step = onboardingStep ?? data?.step;
    if (step !== 'review') return;

    const timer = setTimeout(() => {
      hasNavigated.current = true;
      setDriverStatus('approved');
      setOnboardingStep('approved');
      setKycSessionId(null);
      setShowApproved(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      const navTimer = setTimeout(() => {
        navigation.replace('Profile');
      }, 1500);
      return () => clearTimeout(navTimer);
    }, 3000);

    return () => clearTimeout(timer);
  }, [
    onboardingStep,
    data,
    navigation,
    setKycSessionId,
    setDriverStatus,
    setOnboardingStep,
    fadeAnim,
    setShowApproved,
  ]);

  const showError = failureCount >= 3;

  const handleRetry = () => {
    refetch();
  };

  const handleGoBack = () => {
    if (data?.step === 'kyc' || !data?.step) {
      navigation.navigate('KYCVerify');
    } else {
      navigation.navigate('OnboardingStep2');
    }
    hasNavigated.current = false;
  };

  const handleGoToDocuments = () => {
    navigation.navigate('OnboardingStep2');
    hasNavigated.current = false;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        {showApproved ? (
          <Animated.View style={[styles.approvedContent, { opacity: fadeAnim }]}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkIcon}>✓</Text>
            </View>
            <Text style={styles.approvedTitle}>Verificado</Text>
            <Text style={styles.approvedSubtitle}>Tu cuenta esta lista para empezar</Text>
          </Animated.View>
        ) : showError ? (
          <>
            <Text style={styles.errorTitle}>No pudimos verificar tu estado. Reintenta.</Text>
            <Button title="Reintentar" onPress={handleRetry} style={styles.button} />
            {(data?.step === 'review' ||
              data?.step === 'documents' ||
              onboardingStep === 'review' ||
              onboardingStep === 'documents') && (
              <Button
                title="Volver a subir documentos"
                variant="secondary"
                onPress={handleGoToDocuments}
                style={styles.button}
              />
            )}
          </>
        ) : rejectedMessage ? (
          <>
            <View style={styles.iconCircle}>
              <Text style={styles.rejectedIcon}>✕</Text>
            </View>
            <Text style={styles.rejectedText}>{rejectedMessage}</Text>
            {rejectedReason ? (
              <Text style={styles.rejectedReason}>Motivo: {rejectedReason}</Text>
            ) : null}
            <Text style={styles.rejectedHint}>Por favor volve a intentarlo.</Text>
            <Button
              title={data?.step === 'kyc' ? 'Reintentar verificacion' : 'Volver a subir documentos'}
              onPress={handleGoBack}
              style={styles.button}
            />
          </>
        ) : (
          <>
            <View style={styles.iconCircle}>
              <Text style={styles.clockIcon}>⏳</Text>
            </View>

            {data?.step === 'kyc' ? (
              <>
                <Text style={styles.title}>Tu identidad esta siendo verificada</Text>
                <Text style={styles.subtitle}>
                  DIDIT esta revisando tus datos biometricos. Te avisaremos cuando este lista.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Tus datos estan siendo verificados</Text>
                <Text style={styles.subtitle}>Te avisaremos cuando tu cuenta este verificada</Text>
                {(data?.step === 'review' || data?.step === 'documents') && (
                  <Button
                    title="Volver a subir documentos"
                    variant="secondary"
                    onPress={handleGoToDocuments}
                    style={styles.button}
                  />
                )}
              </>
            )}
          </>
        )}
      </View>

      {!showApproved && !rejectedMessage && !showError && (
        <Button
          title="Salir"
          variant="secondary"
          onPress={() => BackHandler.exitApp()}
          style={styles.exitButton}
        />
      )}

      {__DEV__ && !showApproved && (
        <Button
          title="Saltar >> Profile (DEV)"
          variant="cta"
          onPress={() => {
            hasNavigated.current = true;
            setDriverStatus('approved');
            setOnboardingStep('approved');
            setKycSessionId(null);
            navigation.replace('Profile');
          }}
          style={styles.exitButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0, 194, 179, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 40,
  },
  rejectedIcon: {
    fontSize: 36,
    color: theme.colors.dangerRed,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 24,
  },
  errorTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  rejectedText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 280,
  },
  rejectedReason: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 22,
  },
  rejectedHint: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
  },
  approvedContent: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    fontSize: 48,
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
  },
  approvedTitle: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  approvedSubtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
  },
  button: {
    marginTop: theme.spacing.sm,
  },
  exitButton: {
    alignSelf: 'center',
    marginBottom: theme.spacing.xl,
  },
});
