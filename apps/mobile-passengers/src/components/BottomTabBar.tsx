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
  route: string;
}[] = [
  { key: 'home', label: 'Inicio', icon: 'home', route: 'Home' },
  { key: 'search', label: 'Buscar', icon: 'search', route: 'Home' },
  { key: 'trips', label: 'Viajes', icon: 'list', route: 'TripHistory' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline', route: 'Profile' },
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
      style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => handlePress(tab)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={tab.icon}
              size={20}
              color={isActive ? theme.colors.primary : theme.colors.mediumGray}
            />
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
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
  },
  tabActive: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
