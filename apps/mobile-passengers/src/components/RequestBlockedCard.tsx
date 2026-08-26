import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RideRequestErrorInfo } from '../lib/rideRequestErrors';
import { buildSupportWhatsAppUrl } from '../lib/supportContact';
import { theme } from '../theme';

type Props = {
  info: RideRequestErrorInfo;
  onOpenHistory?: () => void;
  onOpenSupport?: () => void;
};

export function RequestBlockedCard({ info, onOpenHistory, onOpenSupport }: Props) {
  const openWhatsApp = () => {
    void Linking.openURL(buildSupportWhatsAppUrl());
  };

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <Ionicons name="shield-outline" size={22} color={theme.colors.dangerRed} />
        <Text style={styles.title}>{info.title}</Text>
      </View>
      <Text style={styles.message}>{info.message}</Text>

      {info.showSupport || info.showHistory ? (
        <View style={styles.actions}>
          {info.showSupport ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={openWhatsApp}
              activeOpacity={0.85}
              accessibilityLabel="Contactar soporte por WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={18} color={theme.colors.white} />
              <Text style={styles.primaryBtnText}>Contactar soporte</Text>
            </TouchableOpacity>
          ) : null}
          {info.showHistory && onOpenHistory ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onOpenHistory}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Ver historial</Text>
            </TouchableOpacity>
          ) : null}
          {info.showSupport && onOpenSupport ? (
            <TouchableOpacity style={styles.linkBtn} onPress={onOpenSupport} activeOpacity={0.85}>
              <Text style={styles.linkBtnText}>Más ayuda en Soporte</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.25)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.dangerRed,
  },
  message: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    lineHeight: 20,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
  },
  primaryBtnText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
  },
  secondaryBtnText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkBtnText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    textDecorationLine: 'underline',
  },
});
