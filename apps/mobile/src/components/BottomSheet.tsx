import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { bottomSheetTranslateRange } from './bottomSheetMath';
import { Text } from './ui/Text';

interface BottomSheetProps {
  /** [collapsedHeight, expandedHeight] — content height ABOVE the tab bar. */
  snapPoints: [number, number];
  /** Distance from screen bottom to sit on (tab bar + safe inset). Default 0. */
  bottomOffset?: number;
  /**
   * Horizontal inset so the sheet reads as a floating card (match tab pill).
   * Default 0 keeps edge-to-edge for any non-home callers.
   */
  horizontalInset?: number;
  /** One-line invite shown under the handle while collapsed (fallback). */
  peekerLabel?: string;
  /** Optional two-part peeker (e.g. "Ganaste hoy" + "$1.200"). Prefer over packing into peekerLabel. */
  peekerTitle?: string;
  peekerValue?: string;
  children: React.ReactNode;
  onSnapChange?: (index: number) => void;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  snapPoints,
  bottomOffset = 0,
  horizontalInset = 0,
  peekerLabel,
  peekerTitle,
  peekerValue,
  children,
  onSnapChange,
}) => {
  const [collapsedHeight, expandedHeight] = snapPoints;
  const { collapsedTranslateY, expandedTranslateY } = useMemo(
    () => bottomSheetTranslateRange(collapsedHeight, expandedHeight),
    [collapsedHeight, expandedHeight],
  );

  // Larger Y = more hidden (pushed down past the tab bar).
  const collapsedY = collapsedTranslateY;
  const expandedY = expandedTranslateY;

  const translateY = useRef(new Animated.Value(collapsedY)).current;
  const dragStartY = useRef(collapsedY);
  const [snapIndex, setSnapIndex] = useState(0);
  const snapIndexRef = useRef(0);
  const collapsedYRef = useRef(collapsedY);
  const expandedYRef = useRef(expandedY);
  collapsedYRef.current = collapsedY;
  expandedYRef.current = expandedY;

  const snapTo = useCallback(
    (index: number) => {
      const target = index === 0 ? collapsedYRef.current : expandedYRef.current;
      Animated.spring(translateY, {
        toValue: target,
        damping: 50,
        stiffness: 300,
        mass: 0.5,
        useNativeDriver: true,
      }).start();
    },
    [translateY],
  );

  const notifySnap = useCallback(
    (index: number) => {
      snapIndexRef.current = index;
      setSnapIndex(index);
      onSnapChange?.(index);
    },
    [onSnapChange],
  );

  // Keep position in sync when snap heights / tab inset change.
  useEffect(() => {
    const target = snapIndexRef.current === 0 ? collapsedY : expandedY;
    translateY.setValue(target);
  }, [translateY, collapsedY, expandedY]);

  // Drag on handle + peeker strip so ScrollView body can scroll freely when expanded.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStartY.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const minY = expandedYRef.current;
          const maxY = collapsedYRef.current;
          const next = dragStartY.current + gestureState.dy;
          translateY.setValue(Math.max(minY, Math.min(maxY, next)));
        },
        onPanResponderRelease: (_, gestureState) => {
          const minY = expandedYRef.current;
          const maxY = collapsedYRef.current;
          const currentY = Math.max(minY, Math.min(maxY, dragStartY.current + gestureState.dy));
          const mid = (maxY + minY) / 2;
          let nextIndex: 0 | 1;
          if (gestureState.vy < -0.35) {
            nextIndex = 1;
          } else if (gestureState.vy > 0.35) {
            nextIndex = 0;
          } else {
            nextIndex = currentY < mid ? 1 : 0;
          }
          snapTo(nextIndex);
          notifySnap(nextIndex);
        },
      }),
    [translateY, snapTo, notifySnap],
  );

  const overlayOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: collapsedY > expandedY ? [expandedY, collapsedY] : [0, 1],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [translateY, collapsedY, expandedY],
  );

  const handleOverlayPress = useCallback(() => {
    snapTo(0);
    notifySnap(0);
  }, [snapTo, notifySnap]);

  const collapsed = snapIndex === 0;
  const title = peekerTitle?.trim() ?? '';
  const value = peekerValue?.trim() ?? '';
  const hasTwoPart = title.length > 0 || value.length > 0;
  const label = peekerLabel?.trim() || 'Deslizá para ver más';
  const a11yLabel = hasTwoPart ? [title, value].filter(Boolean).join(' ').trim() || label : label;

  const inset = Math.max(0, horizontalInset);

  return (
    <>
      <Animated.View
        style={[
          styles.overlay,
          { opacity: overlayOpacity, bottom: bottomOffset },
          { pointerEvents: snapIndex === 1 ? 'auto' : 'none' },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          inset > 0 ? styles.sheetFloating : null,
          {
            left: inset,
            right: inset,
            bottom: bottomOffset,
            height: expandedHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View
          style={styles.grabber}
          {...panResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel={
            collapsed ? `${a11yLabel}. Deslizá hacia arriba` : 'Deslizá hacia abajo para cerrar'
          }
        >
          <View style={styles.handle} />
          {collapsed &&
            (hasTwoPart ? (
              <View style={styles.peekerRow}>
                {title.length > 0 ? (
                  <Text style={styles.peekerTitle} numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
                {value.length > 0 ? (
                  <Text
                    style={styles.peekerValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {value}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.peekerText} numberOfLines={1}>
                {label}
              </Text>
            ))}
        </View>
        <View
          style={[styles.body, collapsed && styles.bodyCollapsed]}
          pointerEvents={collapsed ? 'none' : 'auto'}
        >
          {children}
        </View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    zIndex: 20,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 16,
    zIndex: 30,
    overflow: 'hidden',
  },
  /** Floating card: all-corner radius + softer lift off the map (matches pill). */
  sheetFloating: {
    borderRadius: theme.radius.xl,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.spacing.sm + 2,
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    gap: 6,
    minHeight: 48,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
  },
  peekerText: {
    width: '100%',
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  peekerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.xs,
  },
  peekerTitle: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  peekerValue: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primary,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyCollapsed: {
    opacity: 0,
  },
});
