import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

export type TabKey = 'home' | 'earnings' | 'trips' | 'profile';

interface TabBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
}

interface TabItem {
  key: TabKey;
  label: string;
  icon: string;
}

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: '🏠' },
  { key: 'earnings', label: 'Cobros', icon: '💰' },
  { key: 'trips', label: 'Viajes', icon: '🚗' },
  { key: 'profile', label: 'Perfil', icon: '👤' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.icon, !isActive && styles.inactiveIcon]}>{tab.icon}</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  tab: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    minWidth: 64,
    minHeight: 48,
  },
  icon: {
    fontSize: 22,
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
