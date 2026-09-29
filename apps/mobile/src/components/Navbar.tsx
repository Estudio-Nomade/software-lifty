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
  /** `bar` = solid full-width (default). `floating` = transparent chrome over map. `light` = surface bar + navy text. */
  variant?: 'bar' | 'floating' | 'light';
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  onBack,
  showBack = true,
  backgroundColor,
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
  const light = variant === 'light';
  const barBg = backgroundColor ?? (light ? theme.colors.background : theme.colors.deepBlue);
  const iconColor = floating || light ? theme.colors.deepBlue : theme.colors.white;
  const titleColor = light ? theme.colors.deepBlue : theme.colors.white;

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
          <Ionicons name="menu" size={24} color={iconColor} />
        </TouchableOpacity>
      );
    }
    if (showBack) {
      return (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={iconColor} />
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
        light ? styles.lightContainer : null,
        {
          backgroundColor: floating ? 'transparent' : barBg,
          paddingTop: insets.top,
          height: theme.dimensions.navbarHeight + insets.top,
        },
        style,
      ]}
      pointerEvents="box-none"
    >
      {renderLeft()}
      {title && !floating ? (
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
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
  lightContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 43, 69, 0.06)',
  },
  floatingControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    padding: 0,
    ...theme.shadows.card,
  },
  backButton: {
    padding: theme.spacing.xs,
    minWidth: 40,
  },
  title: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: -0.2,
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
