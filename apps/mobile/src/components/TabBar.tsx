import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarVisibility } from '../context/TabBarVisibilityContext';
import {
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_HORIZONTAL_INSET,
  TAB_BAR_PILL_HEIGHT,
  getTabBarReserve,
} from '../lib/tabBarLayout';
import { theme } from '../theme';
import { Text } from './ui/Text';

export type TabKey = 'home' | 'earnings' | 'trips' | 'profile';

interface TabBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
}

interface TabItem {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { key: 'earnings', label: 'Cobros', icon: 'wallet-outline', iconActive: 'wallet' },
  { key: 'trips', label: 'Viajes', icon: 'car-outline', iconActive: 'car' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline', iconActive: 'person' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  const { visible } = useTabBarVisibility();
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

  const bottom = TAB_BAR_BOTTOM_GAP + Math.max(insets.bottom, 8);

  return (
    <Animated.View
      testID="driver-tab-bar"
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
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWell, isActive && styles.iconWellActive]}>
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={22}
                  color={isActive ? theme.colors.primary : theme.colors.mediumGray}
                  accessibilityLabel={`${tab.label} tab`}
                />
              </View>
              <Text style={[styles.label, isActive ? styles.activeLabel : styles.inactiveLabel]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    minHeight: TAB_BAR_PILL_HEIGHT,
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
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    minWidth: 64,
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
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
  },
  activeLabel: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
  },
  inactiveLabel: {
    color: theme.colors.mediumGray,
  },
});
