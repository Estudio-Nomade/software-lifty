import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Avatar } from './Avatar';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.72;

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  dividerTop?: boolean;
}

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  userName?: string;
  avatarUrl?: string | null;
  menuItems: MenuItem[];
  footerItems?: MenuItem[];
}

export const SideMenu: React.FC<SideMenuProps> = ({
  visible,
  onClose,
  userName,
  avatarUrl,
  menuItems,
  footerItems,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 14,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.overlayBackground, { opacity: overlayAnim }]} />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.drawer,
          { paddingTop: insets.top + theme.spacing.md, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {userName && (
          <View style={styles.userSection}>
            <View style={styles.avatarLarge}>
              <Avatar uri={avatarUrl ?? null} name={userName} size={64} />
            </View>
            <Text style={styles.userName} numberOfLines={1}>
              {userName}
            </Text>
          </View>
        )}

        <View style={styles.menuItems}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, item.dividerTop && styles.menuItemDividerTop]}
              activeOpacity={0.6}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={item.danger ? theme.colors.dangerRed : theme.colors.deepBlue}
              />
              <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {footerItems && footerItems.length > 0 && (
          <View style={styles.footer}>
            {footerItems.map((item, index) => (
              <TouchableOpacity
                key={`footer-${index}`}
                style={[styles.menuItem, item.dividerTop && styles.menuItemDividerTop]}
                activeOpacity={0.6}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.danger ? theme.colors.dangerRed : theme.colors.deepBlue}
                />
                <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    zIndex: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  overlayBackground: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: theme.colors.white,
    zIndex: 11,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 24,
  },
  userSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  userName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    maxWidth: '80%',
  },
  menuItems: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    gap: theme.spacing.md,
  },
  menuItemDividerTop: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  menuLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  menuLabelDanger: {
    color: theme.colors.dangerRed,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    gap: 2,
  },
});
