import type React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface LiftyWatermarkProps {
  size?: number;
  opacity?: number;
}

export const LiftyWatermark: React.FC<LiftyWatermarkProps> = ({ size = 80, opacity = 0.08 }) => {
  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.text,
          {
            fontSize: size,
            opacity,
          },
        ]}
      >
        LIFTY
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  text: {
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    letterSpacing: 8,
    transform: [{ rotate: '-15deg' }],
  },
});
