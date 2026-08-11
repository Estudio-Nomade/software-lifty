import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function ProfileScreen() {
  const { goBack, navigate } = useAppNavigation();
  const email = useAuthStore((s) => s.email);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Perfil</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={theme.colors.mediumGray} />
        </View>
        <Text style={styles.name}>{email?.split('@')[0] ?? 'Usuario'}</Text>
        <Text style={styles.email}>{email}</Text>

        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigate('PaymentMethod')}>
            <Ionicons name="card-outline" size={22} color={theme.colors.deepBlue} />
            <Text style={styles.menuText}>Método de pago</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.mediumGray} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigate('TripHistory')}>
            <Ionicons name="time-outline" size={22} color={theme.colors.deepBlue} />
            <Text style={styles.menuText}>Historial de viajes</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.mediumGray} />
          </TouchableOpacity>
          <View style={styles.menuItem}>
            <Ionicons name="shield-checkmark-outline" size={22} color={theme.colors.deepBlue} />
            <Text style={styles.menuText}>Seguridad</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.mediumGray} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
  },
  name: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.md,
  },
  email: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: theme.spacing.xs,
  },
  menu: {
    width: '100%',
    marginTop: theme.spacing.xl,
    gap: 1,
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    gap: theme.spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
});
