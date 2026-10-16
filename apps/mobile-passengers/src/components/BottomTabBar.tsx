import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_HORIZONTAL_INSET,
  TAB_BAR_PILL_HEIGHT,
  getTabBarReserve,
} from '../lib/tabBarLayout';
import { theme } from '../theme';

export type PassengerTabKey = 'home' | 'search' | 'trips' | 'profile';

interface BottomTabBarProps {
  activeTab: PassengerTabKey;
  onSearchPress?: () => void;
  /** When false, pill slides down + fades (scroll hide). Default true. */
  visible?: boolean;
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

export function BottomTabBar({ activeTab, onSearchPress, visible = true }: BottomTabBarProps) {
  const { navigate } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const hideDistance = getTabBarReserve(insets.bottom) + theme.spacing.sm;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : hideDistance,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, hideDistance, translateY, opacity]);

  const handlePress = (tab: (typeof TABS)[number]) => {
    if (tab.key === activeTab) return;
    if (tab.key === 'search' && onSearchPress) {
      onSearchPress();
      return;
    }
    navigate(tab.route);
  };

  const bottom = TAB_BAR_BOTTOM_GAP + Math.max(insets.bottom, 8);

  return (
    <Animated.View
      testID="bottom-tab-bar"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.shell,
        {
          left: TAB_BAR_HORIZONTAL_INSET,
          right: TAB_BAR_HORIZONTAL_INSET,
          bottom,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.pill}>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    minHeight: TAB_BAR_PILL_HEIGHT,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
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
