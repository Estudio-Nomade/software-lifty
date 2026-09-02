import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';
import { Avatar } from './Avatar';
import { Text } from './ui/Text';

interface NavbarProps {
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
  backgroundColor?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  showHamburger?: boolean;
  onHamburgerPress?: () => void;
  showAvatar?: boolean;
  avatarName?: string;
  avatarUrl?: string | null;
  style?: ViewStyle;
  /** `bar` = solid full-width (default). `floating` = transparent chrome over map. */
  variant?: 'bar' | 'floating';
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  onBack,
  showBack = true,
  backgroundColor = theme.colors.deepBlue,
  leftElement,
  rightElement,
  showHamburger = false,
  onHamburgerPress,
  showAvatar = false,
  avatarName,
  avatarUrl,
  style,
  variant = 'bar',
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const floating = variant === 'floating';

  const renderLeft = () => {
    if (leftElement) return leftElement;
    if (showHamburger) {
      return (
        <TouchableOpacity
          onPress={onHamburgerPress}
          style={[styles.iconButton, floating && styles.floatingControl]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
        >
          <Ionicons
            name="menu"
            size={24}
            color={floating ? theme.colors.deepBlue : theme.colors.white}
          />
        </TouchableOpacity>
      );
    }
    if (showBack) {
      return (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      );
    }
    return <View style={styles.placeholder} />;
  };

  const renderRight = () => {
    if (rightElement) return rightElement;
    if (showAvatar) {
      return (
        <TouchableOpacity
          style={styles.avatarButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Profile')}
        >
          <Avatar uri={avatarUrl ?? null} name={avatarName ?? ''} size={32} />
        </TouchableOpacity>
      );
    }
    return <View style={styles.placeholder} />;
  };

  return (
    <View
      style={[
        styles.container,
        floating ? styles.floatingContainer : null,
        {
          backgroundColor: floating ? 'transparent' : backgroundColor,
          paddingTop: insets.top,
          height: theme.dimensions.navbarHeight + insets.top,
        },
        style,
      ]}
      pointerEvents="box-none"
    >
      {renderLeft()}
      {title && !floating ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {renderRight()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: theme.dimensions.navbarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    width: '100%',
  },
  floatingContainer: {
    backgroundColor: 'transparent',
  },
  floatingControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    padding: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  backButton: {
    padding: theme.spacing.xs,
    minWidth: 40,
  },
  title: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    minWidth: 40,
  },
  iconButton: {
    minWidth: 40,
    padding: theme.spacing.xs,
  },
  avatarButton: {
    minWidth: 40,
  },
});
