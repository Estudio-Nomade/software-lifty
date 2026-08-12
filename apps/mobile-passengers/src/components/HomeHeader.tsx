import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function HomeHeader() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const displayName = fullName || email?.split('@')[0] || 'Usuario';

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.greeting}>¡Hola, {displayName}!</Text>
        <Text style={styles.subtitle}>¿A dónde vamos hoy?</Text>
      </View>
      <TouchableOpacity
        style={styles.notifBtn}
        activeOpacity={0.7}
        accessibilityLabel="Notificaciones"
        hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
        onPress={() => {
          // TODO: wire to notifications screen when implemented
        }}
      >
        <View style={styles.notifIcon}>
          <View style={styles.notifOuter} />
          <View style={styles.notifDot} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  greeting: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  notifBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
  },
  notifDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.white,
    top: 4,
    right: 4,
  },
});
