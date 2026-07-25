import type React from 'react';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { theme } from '../theme';

interface BottomSheetProps {
  snapPoints: [number, number];
  children: React.ReactNode;
  onSnapChange?: (index: number) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPRING_CONFIG = {
  damping: 50,
  stiffness: 300,
  mass: 0.5,
};

export const BottomSheet: React.FC<BottomSheetProps> = ({ snapPoints, children, onSnapChange }) => {
  const [collapsedHeight, expandedHeight] = snapPoints;
  const maxTranslateY = SCREEN_HEIGHT - collapsedHeight;
  const minTranslateY = SCREEN_HEIGHT - expandedHeight;

  const translateY = useSharedValue(maxTranslateY);
  const [snapIndex, setSnapIndex] = useState(0);

  const snapTo = (index: number) => {
    'worklet';
    const target = index === 0 ? maxTranslateY : minTranslateY;
    translateY.value = withSpring(target, SPRING_CONFIG);
  };

  const onSnap = (index: number) => {
    'worklet';
    runOnJS(setSnapIndex)(index);
    if (onSnapChange) {
      runOnJS(onSnapChange)(index);
    }
  };

  const contextY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      const candidate = contextY.value + event.translationY;
      translateY.value = Math.max(minTranslateY, Math.min(maxTranslateY, candidate));
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const threshold = (maxTranslateY + minTranslateY) / 2;

      if (event.velocityY < -500) {
        snapTo(1);
        onSnap(1);
      } else if (event.velocityY > 500) {
        snapTo(0);
        onSnap(0);
      } else if (currentY < threshold) {
        snapTo(1);
        onSnap(1);
      } else {
        snapTo(0);
        onSnap(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: (maxTranslateY - translateY.value) / (maxTranslateY - minTranslateY),
  }));

  const sheetHeight = expandedHeight;

  const handleOverlayPress = () => {
    'worklet';
    snapTo(0);
    onSnap(0);
  };

  const tapGesture = Gesture.Tap().onEnd(handleOverlayPress);

  return (
    <>
      <GestureDetector gesture={tapGesture}>
        <Animated.View
          style={[
            styles.overlay,
            overlayStyle,
            { pointerEvents: snapIndex === 1 ? 'auto' : 'none' },
          ]}
        />
      </GestureDetector>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, animatedStyle, { height: sheetHeight }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
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
