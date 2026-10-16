import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface BottomSheetProps {
  /** [collapsedHeight, expandedHeight] — real heights ABOVE the tab bar only. */
  snapPoints: [number, number];
  /** Distance from screen bottom to sit on (tab bar reserve). Default 0. */
  bottomOffset?: number;
  /** One-line invite shown under the handle while collapsed. */
  peekerLabel?: string;
  children: React.ReactNode;
  onSnapChange?: (index: number) => void;
}

const TAP_SLOP = 10;
const DRAG_SLOP = 2;

/**
 * Sheet that lives only above the tab bar.
 * Collapsed = compact strip sized to label (centered, not edge-to-edge).
 * Expanded = full-width panel growing upward. Swipe up/down or tap peeker.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  snapPoints,
  bottomOffset = 0,
  peekerLabel,
  children,
  onSnapChange,
}) => {
  const [collapsedHeight, expandedHeight] = snapPoints;
  const collapsedH = Math.max(0, collapsedHeight);
  const expandedH = Math.max(expandedHeight, collapsedH);

  const heightAnim = useRef(new Animated.Value(collapsedH)).current;
  const dragStartH = useRef(collapsedH);
  const grantY = useRef(0);
  const grantX = useRef(0);
  const [snapIndex, setSnapIndex] = useState(0);
  const snapIndexRef = useRef(0);
  const collapsedHRef = useRef(collapsedH);
  const expandedHRef = useRef(expandedH);
  collapsedHRef.current = collapsedH;
  expandedHRef.current = expandedH;

  const snapTo = useCallback(
    (index: number) => {
      const target = index === 0 ? collapsedHRef.current : expandedHRef.current;
      Animated.spring(heightAnim, {
        toValue: target,
        damping: 50,
        stiffness: 300,
        mass: 0.5,
        useNativeDriver: false,
      }).start();
    },
    [heightAnim],
  );

  const notifySnap = useCallback(
    (index: number) => {
      snapIndexRef.current = index;
      setSnapIndex(index);
      onSnapChange?.(index);
    },
    [onSnapChange],
  );

  const goTo = useCallback(
    (index: number) => {
      snapTo(index);
      notifySnap(index);
    },
    [snapTo, notifySnap],
  );

  useEffect(() => {
    const target = snapIndexRef.current === 0 ? collapsedH : expandedH;
    heightAnim.setValue(target);
  }, [heightAnim, collapsedH, expandedH]);

  // Pan only on grabber — body keeps button taps (e.g. "Ver ganancias" → Cobros).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          grantY.current = e.nativeEvent.pageY;
          grantX.current = e.nativeEvent.pageX;
          heightAnim.stopAnimation((value) => {
            dragStartH.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const minH = collapsedHRef.current;
          const maxH = expandedHRef.current;
          const next = dragStartH.current - gestureState.dy;
          heightAnim.setValue(Math.max(minH, Math.min(maxH, next)));
        },
        onPanResponderRelease: (_, gestureState) => {
          const minH = collapsedHRef.current;
          const maxH = expandedHRef.current;
          const absDy = Math.abs(gestureState.dy);
          const absDx = Math.abs(gestureState.dx);

          if (absDy < TAP_SLOP && absDx < TAP_SLOP) {
            goTo(snapIndexRef.current === 0 ? 1 : 0);
            return;
          }

          const currentH = Math.max(minH, Math.min(maxH, dragStartH.current - gestureState.dy));
          const mid = (maxH + minH) / 2;
          let nextIndex: 0 | 1;
          if (gestureState.vy < -0.2 || gestureState.dy < -24) {
            nextIndex = 1;
          } else if (gestureState.vy > 0.2 || gestureState.dy > 24) {
            nextIndex = 0;
          } else {
            nextIndex = currentH > mid ? 1 : 0;
          }
          goTo(nextIndex);
        },
      }),
    [heightAnim, goTo],
  );

  const overlayOpacity = useMemo(
    () =>
      heightAnim.interpolate({
        inputRange: collapsedH < expandedH ? [collapsedH, expandedH] : [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [heightAnim, collapsedH, expandedH],
  );

  const handleOverlayPress = useCallback(() => {
    goTo(0);
  }, [goTo]);

  const collapsed = snapIndex === 0;
  const label = peekerLabel?.trim() || 'Deslizá para ver más';

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

      {/* Transparent shell: full width for layout; card inside hugs text when collapsed. */}
      <Animated.View
        style={[
          styles.shell,
          {
            bottom: bottomOffset,
            height: heightAnim,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.card, collapsed ? styles.cardCollapsed : styles.cardExpanded]}>
          <View
            style={styles.grabber}
            {...panResponder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel={
              collapsed
                ? `${label}. Deslizá hacia arriba o tocá`
                : 'Deslizá hacia abajo para cerrar'
            }
          >
            <View style={styles.handle} />
            {collapsed ? (
              <Text style={styles.peekerText} numberOfLines={1}>
                {label}
              </Text>
            ) : null}
          </View>
          <View
            style={[styles.body, collapsed && styles.bodyCollapsed]}
            pointerEvents={collapsed ? 'none' : 'auto'}
          >
            {children}
          </View>
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
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'center',
    overflow: 'visible',
  },
  card: {
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    shadowColor: '#0D2B45',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 14,
  },
  /** Compact strip: width follows label, centered, not touching screen edges. */
  cardCollapsed: {
    alignSelf: 'center',
    maxWidth: '88%',
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.08)',
  },
  /** Expanded panel: full width above tab bar. */
  cardExpanded: {
    alignSelf: 'stretch',
    width: '100%',
    flex: 1,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  grabber: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.spacing.sm + 2,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: 6,
    minHeight: 48,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(13, 43, 69, 0.22)',
  },
  peekerText: {
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
    // No width:100% — box hugs the text.
  },
  body: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  bodyCollapsed: {
    opacity: 0,
    height: 0,
    overflow: 'hidden',
  },
});
