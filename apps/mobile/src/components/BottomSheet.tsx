import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

interface BottomSheetProps {
  snapPoints: [number, number];
  children: React.ReactNode;
  onSnapChange?: (index: number) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const BottomSheet: React.FC<BottomSheetProps> = ({ snapPoints, children, onSnapChange }) => {
  const [collapsedHeight, expandedHeight] = snapPoints;
  const maxTranslateY = SCREEN_HEIGHT - collapsedHeight;
  const minTranslateY = SCREEN_HEIGHT - expandedHeight;

  const translateY = useRef(new Animated.Value(maxTranslateY)).current;
  const [snapIndex, setSnapIndex] = useState(0);

  const snapTo = useCallback(
    (index: number) => {
      const target = index === 0 ? maxTranslateY : minTranslateY;
      Animated.spring(translateY, {
        toValue: target,
        damping: 50,
        stiffness: 300,
        mass: 0.5,
        useNativeDriver: true,
      }).start();
    },
    [translateY, maxTranslateY, minTranslateY],
  );

  const notifySnap = useCallback(
    (index: number) => {
      setSnapIndex(index);
      onSnapChange?.(index);
    },
    [onSnapChange],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const candidate = (translateY as unknown as { _value: number })._value + gestureState.dy;
        const clamped = Math.max(minTranslateY, Math.min(maxTranslateY, candidate));
        translateY.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentY = (translateY as unknown as { _value: number })._value;
        const threshold = (maxTranslateY + minTranslateY) / 2;

        if (gestureState.vy < -0.5) {
          snapTo(1);
          notifySnap(1);
        } else if (gestureState.vy > 0.5) {
          snapTo(0);
          notifySnap(0);
        } else if (currentY < threshold) {
          snapTo(1);
          notifySnap(1);
        } else {
          snapTo(0);
          notifySnap(0);
        }
      },
    }),
  ).current;

  useEffect(() => {
    const listenerId = translateY.addListener(({ value }) => {
      const next = value <= threshold ? 1 : 0;
      if (next !== snapIndex) {
        setSnapIndex(next);
      }
    });
    const threshold = (maxTranslateY + minTranslateY) / 2;
    return () => {
      translateY.removeListener(listenerId);
    };
  }, [translateY, maxTranslateY, minTranslateY, snapIndex]);

  const overlayOpacity = translateY.interpolate({
    inputRange: [minTranslateY, maxTranslateY],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleOverlayPress = useCallback(() => {
    snapTo(0);
    notifySnap(0);
  }, [snapTo, notifySnap]);

  return (
    <>
      <Animated.View
        style={[
          styles.overlay,
          { opacity: overlayOpacity },
          { pointerEvents: snapIndex === 1 ? 'auto' : 'none' },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY }], height: expandedHeight }]}
      >
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        {children}
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.mediumGray,
  },
});
