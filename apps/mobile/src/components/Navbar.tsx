import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

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
  style?: ViewStyle;
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
  style,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();

  const renderLeft = () => {
    if (leftElement) return leftElement;
    if (showHamburger) {
      return (
        <TouchableOpacity onPress={onHamburgerPress} style={styles.iconButton}>
          <Text style={styles.iconText}>☰</Text>
        </TouchableOpacity>
      );
    }
    if (showBack) {
      return (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.colors.white }]}>←</Text>
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
          <Text style={styles.avatarText}>👤</Text>
        </TouchableOpacity>
      );
    }
    return <View style={styles.placeholder} />;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: insets.top,
          height: theme.dimensions.navbarHeight + insets.top,
        },
        style,
      ]}
    >
      {renderLeft()}
      {title ? <Text style={styles.title}>{title}</Text> : <View style={{ flex: 1 }} />}
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
  backButton: {
    padding: theme.spacing.xs,
    minWidth: 40,
  },
  backText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
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
  iconText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
  avatarButton: {
    minWidth: 40,
  },
  avatarText: {
    fontSize: 20,
  },
});
