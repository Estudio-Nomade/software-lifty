import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

const SUGGESTIONS = [
  { icon: 'business-outline', name: 'Centro', desc: 'Centro de la ciudad' },
  { icon: 'bus-outline', name: 'Terminal', desc: 'Terminal de Ómnibus' },
  { icon: 'medkit-outline', name: 'Hospital', desc: 'Hospital Ramón Santamarina' },
];

export function HomeScreen() {
  const { navigate } = useAppNavigation();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const displayName = fullName || email?.split('@')[0] || 'Usuario';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
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

      <View style={styles.bodyWrap}>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.greeting}>
            <Text style={styles.greetingHi}>¡Hola, {displayName}!</Text>
            <Text style={styles.greetingSub}>¿A dónde vamos hoy?</Text>
          </View>

          <View style={styles.mapArea}>
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
              <Text style={styles.mapLabel}>Mapa</Text>
            </View>
            <TouchableOpacity style={styles.centerBtn}>
              <Ionicons name="locate" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.shortcuts}>
            <TouchableOpacity style={styles.shortcut} onPress={() => navigate('TripRequest')}>
              <Ionicons name="home" size={24} color={theme.colors.deepBlue} />
              <Text style={styles.shortcutLabel}>Casa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcut} onPress={() => navigate('TripRequest')}>
              <Ionicons name="briefcase" size={24} color={theme.colors.deepBlue} />
              <Text style={styles.shortcutLabel}>Trabajo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcut} onPress={() => navigate('TripRequest')}>
              <Ionicons name="time" size={24} color={theme.colors.deepBlue} />
              <Text style={styles.shortcutLabel}>Reciente</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIllustration}>
              <Ionicons name="map-outline" size={36} color={theme.colors.primary} />
              <Text style={styles.heroRoute}>• ╌ ╌ ╌ ╌ ╌ •</Text>
              <Ionicons name="location" size={28} color={theme.colors.primary} />
            </View>
            <Text style={styles.heroTagline}>Tu viaje, simple y confiable</Text>
            <TouchableOpacity
              style={styles.heroCTA}
              onPress={() => navigate('TripRequest')}
              activeOpacity={0.85}
            >
              <Text style={styles.heroCTAText}>Solicitar viaje</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.suggestionsTitle}>Sugerencias para vos</Text>

          {SUGGESTIONS.map((item) => (
            <TouchableOpacity
              key={item.name}
              style={styles.suggestionItem}
              onPress={() => navigate('TripRequest')}
              activeOpacity={0.7}
            >
              <View style={styles.suggestionIconCircle}>
                <Ionicons name={item.icon as any} size={20} color={theme.colors.deepBlue} />
              </View>
              <View style={styles.suggestionTexts}>
                <Text style={styles.suggestionName}>{item.name}</Text>
                <Text style={styles.suggestionDesc}>{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

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

      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => navigate('TripRequest')}
        activeOpacity={0.9}
      >
        <Ionicons name="search" size={18} color={theme.colors.mediumGray} />
        <Text style={styles.searchPlaceholder}>¿A dónde vas?</Text>
        <View style={styles.searchPin}>
          <Ionicons name="locate" size={18} color={theme.colors.primary} />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.deepBlue,
  },
  navbar: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  logo: {
    width: 72,
    height: 28,
  },
  navActions: {
    flexDirection: 'row',
    gap: 4,
  },
  navBtn: {
    padding: theme.spacing.sm,
  },
  body: {
    flexGrow: 1,
    backgroundColor: theme.colors.lightGray,
  },
  bodyWrap: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: theme.spacing.md,
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
    height: 320,
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
  shortcuts: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    height: 72,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.white,
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
  heroCard: {
    backgroundColor: theme.colors.deepBlue,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  heroIllustration: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 60,
  },
  heroRoute: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.regular,
  },
  heroTagline: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
    textAlign: 'center',
  },
  heroCTA: {
    width: '100%',
    height: 48,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCTAText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  suggestionsTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  suggestionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionTexts: {
    flex: 1,
    gap: 2,
  },
  suggestionName: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  suggestionDesc: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  tabBar: {
    flexDirection: 'row',
    height: theme.dimensions.tabBarHeight,
    alignItems: 'center',
    backgroundColor: theme.colors.white,
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
  searchBar: {
    position: 'absolute',
    top: 350,
    left: theme.spacing.md,
    right: theme.spacing.md,
    height: 48,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  searchPin: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
