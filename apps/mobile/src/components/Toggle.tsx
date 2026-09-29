import type React from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

interface ToggleProps {
  value: boolean;
  onToggle: (value: boolean) => void;
}

const WIDTH = 52;
const HEIGHT = 32;
const PADDING = theme.spacing.xs;
const THUMB_SIZE = 24;
const TRAVEL = WIDTH - THUMB_SIZE - PADDING * 2;

export const Toggle: React.FC<ToggleProps> = ({ value, onToggle }) => {
  const translateX = useRef(new Animated.Value(value ? TRAVEL : 0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: value ? TRAVEL : 0,
      useNativeDriver: true,
      stiffness: 300,
      damping: 28,
    }).start();
  }, [value, translateX]);

  const backgroundColor = translateX.interpolate({
    inputRange: [0, TRAVEL],
    outputRange: [theme.colors.mediumGray, theme.colors.turquoise],
  });

  return (
    <TouchableOpacity onPress={() => onToggle(!value)} activeOpacity={0.9}>
      <Animated.View style={[styles.container, { backgroundColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    paddingHorizontal: PADDING,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
