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
}

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'earnings', label: 'Cobros', icon: 'wallet-outline' },
  { key: 'trips', label: 'Viajes', icon: 'car-outline' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={isActive ? theme.colors.turquoise : theme.colors.mediumGray}
              style={!isActive && styles.inactiveIcon}
              accessibilityLabel={`${tab.label} tab`}
            />
            <Text style={[styles.label, isActive ? styles.activeLabel : styles.inactiveLabel]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
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
    backgroundColor: theme.colors.white,
    paddingTop: theme.spacing.sm,
    minHeight: theme.dimensions.tabBarHeight,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 1000,
  },
  tab: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    minWidth: 64,
    minHeight: 48,
  },
  inactiveIcon: {
    opacity: 0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
  },
  activeLabel: {
    color: theme.colors.turquoise,
  },
  inactiveLabel: {
    color: theme.colors.mediumGray,
  },
  activeIndicator: {
    width: 24,
    height: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.turquoise,
    marginTop: 2,
  },
});
