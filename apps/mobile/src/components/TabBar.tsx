import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.sm,
    minHeight: theme.dimensions.tabBarHeight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(13, 43, 69, 0.06)',
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 1000,
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
