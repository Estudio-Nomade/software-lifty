import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { theme } from '../theme';

export function HomeHeader() {
  const { navigate } = useAppNavigation();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
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
        onPress={() => navigate('Notifications')}
      >
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        {unreadCount > 0 ? <View style={styles.badge} /> : null}
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
  logo: {
    width: 44,
    height: 32,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.amber,
    borderWidth: 1.5,
    borderColor: theme.colors.deepBlue,
  },
});
