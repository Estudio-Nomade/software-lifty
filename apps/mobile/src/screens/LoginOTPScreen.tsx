import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useVerifyEmail } from '../hooks/useAuth';
import { routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

const COOLDOWN_SECONDS = 30;

export const LoginOTPScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const verifyEmail = useVerifyEmail();
  const email = useAuthStore((s) => s.phone);
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || !email || verifyEmail.isPending) return;
    setCooldown(COOLDOWN_SECONDS);
  }, [cooldown, email, verifyEmail]);

  const handleVerify = async () => {
    if (otp.length !== 6 || verifyEmail.isPending || !email) return;
    setStatusError(null);
    try {
      await verifyEmail.mutateAsync({ email, code: otp });
      try {
        const { data: body } = await apiClient.get('/drivers/me/status');
        const payload = body?.data ?? body;
        const parsed = driverStatusSchema.safeParse(payload);
        const driverData = parsed.success ? parsed.data : (payload as DriverStatus);

        const route = routeForDriverStatus(driverData);
        if (route.status) {
          setDriverStatus(route.status);
        }

        if (route.blockedMessage) {
          setStatusError(route.blockedMessage);
          return;
        }
        if (route.screen) {
          navigation.navigate(route.screen);
        }
      } catch (apiErr: any) {
        console.log('[LoginOTP] /drivers/me/status ERROR:', apiErr?.message);
      }
    } catch {
      // error displayed via verifyEmail.error
    }
  };

  const isOTPComplete = otp.length === 6;
  const displayEmail = email || '';
  const errorMessage = verifyEmail.error?.message || statusError;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacerTop} />
      <Text style={styles.title}>Ingresa el codigo</Text>
      <View style={styles.gapMd} />
      <Text style={styles.subtitle}>
        {email
          ? `Te enviamos un codigo a ${displayEmail}`
          : 'Te enviamos un codigo de verificacion'}
      </Text>
      <View style={styles.gapMd} />

      <OTPInput length={6} value={otp} onChange={setOtp} />
      <View style={styles.gapMd} />

      <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || verifyEmail.isPending}>
        <Text
          style={[styles.resend, (cooldown > 0 || verifyEmail.isPending) && styles.resendDisabled]}
        >
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'No te llego? Reenviar'}
        </Text>
      </TouchableOpacity>
      <View style={styles.spacerBottom} />

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <Button
        title="VERIFICAR CODIGO"
        onPress={handleVerify}
        disabled={!isOTPComplete}
        loading={verifyEmail.isPending}
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
  },
  header: {
    height: theme.dimensions.navbarHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  backText: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.lg,
  },
  spacerTop: {
    height: 48,
    width: 1,
  },
  spacerBottom: {
    height: 32,
    width: 1,
  },
  gapMd: {
    height: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  resend: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  resendDisabled: {
    color: theme.colors.mediumGray,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  button: {
    width: 327,
  },
});
