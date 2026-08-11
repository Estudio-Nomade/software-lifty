import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export function HomeScreen() {
  const { navigate } = useAppNavigation();
  const email = useAuthStore((s) => s.email);
  const displayName = email?.split('@')[0] ?? 'Usuario';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <Text style={styles.brand}>Lifty</Text>
        <View style={styles.navActions}>
          <TouchableOpacity style={styles.navBtn}>
            <Ionicons name="notifications-outline" size={22} color={theme.colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn}>
            <Ionicons name="person-circle-outline" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn}>
            <Ionicons name="menu" size={24} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.greeting}
        onPress={() => navigate('TripRequest')}
        activeOpacity={0.8}
      >
        <Text style={styles.greetingHi}>¡Hola, {displayName}!</Text>
        <Text style={styles.greetingSub}>¿A dónde vamos hoy?</Text>
      </TouchableOpacity>

      <View style={styles.mapArea}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
          <Text style={styles.mapLabel}>Mapa</Text>
        </View>
        <TouchableOpacity style={styles.centerBtn}>
          <Ionicons name="locate" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomDock}>
        <View style={styles.shortcuts}>
          <TouchableOpacity style={styles.shortcut}>
            <Ionicons name="home" size={24} color={theme.colors.deepBlue} />
            <Text style={styles.shortcutLabel}>Casa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcut}>
            <Ionicons name="briefcase" size={24} color={theme.colors.deepBlue} />
            <Text style={styles.shortcutLabel}>Trabajo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcut}>
            <Ionicons name="time" size={24} color={theme.colors.deepBlue} />
            <Text style={styles.shortcutLabel}>Reciente</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.promo} activeOpacity={0.8}>
          <Text style={styles.promoText}>🎉 20% OFF en tu primer viaje</Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.white} />
        </TouchableOpacity>

        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tab}>
            <Ionicons name="home" size={20} color={theme.colors.primary} />
            <Text style={styles.tabActive}>Inicio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab}>
            <Ionicons name="search" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Buscar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => navigate('TripHistory')}>
            <Ionicons name="list" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Viajes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => navigate('Profile')}>
            <Ionicons name="person-outline" size={20} color={theme.colors.mediumGray} />
            <Text style={styles.tabLabel}>Perfil</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  navbar: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  brand: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  navActions: {
    flexDirection: 'row',
    gap: 4,
  },
  navBtn: {
    padding: theme.spacing.sm,
  },
  greeting: {
    backgroundColor: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: 2,
  },
  greetingHi: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  greetingSub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#B8D4E3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholder: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  mapLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  centerBtn: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomDock: {
    backgroundColor: theme.colors.white,
    paddingTop: theme.spacing.sm,
  },
  shortcuts: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    height: 64,
    gap: theme.spacing.md,
  },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  shortcutLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.amber,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    height: 44,
    marginBottom: theme.spacing.sm,
  },
  promoText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  tabBar: {
    flexDirection: 'row',
    height: theme.dimensions.tabBarHeight,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabActive: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
