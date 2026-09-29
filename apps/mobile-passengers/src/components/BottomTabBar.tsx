import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export type PassengerTabKey = 'home' | 'search' | 'trips' | 'profile';

interface BottomTabBarProps {
  activeTab: PassengerTabKey;
  onSearchPress?: () => void;
}

const TABS: {
  key: PassengerTabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline', iconActive: 'home', route: 'Home' },
  { key: 'search', label: 'Buscar', icon: 'search-outline', iconActive: 'search', route: 'Home' },
  { key: 'trips', label: 'Viajes', icon: 'list-outline', iconActive: 'list', route: 'TripHistory' },
  {
    key: 'profile',
    label: 'Perfil',
    icon: 'person-outline',
    iconActive: 'person',
    route: 'Profile',
  },
];

export function BottomTabBar({ activeTab, onSearchPress }: BottomTabBarProps) {
  const { navigate } = useAppNavigation();
  const insets = useSafeAreaInsets();

  const handlePress = (tab: (typeof TABS)[number]) => {
    if (tab.key === activeTab) return;
    if (tab.key === 'search' && onSearchPress) {
      onSearchPress();
      return;
    }
    navigate(tab.route);
  };

  return (
    <View
      testID="bottom-tab-bar"
      style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => handlePress(tab)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWell, isActive && styles.iconWellActive]}>
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={22}
                color={isActive ? theme.colors.primary : theme.colors.mediumGray}
              />
            </View>
            <Text style={isActive ? styles.tabActive : styles.tabLabel}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    minHeight: theme.dimensions.tabBarHeight,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(13, 43, 69, 0.06)',
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
    minHeight: 48,
  },
  iconWell: {
    width: 44,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellActive: {
    backgroundColor: 'rgba(0, 194, 179, 0.12)',
  },
  tabActive: {
    fontSize: 11,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
});
