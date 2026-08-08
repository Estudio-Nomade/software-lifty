import type React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

export const ChatBackground: React.FC = () => {
  const rows: React.ReactNode[] = [];
  const SIZE = 6;
  const GAP = 24;

  for (let y = 0; y < 35; y++) {
    const offset = y % 2 === 0 ? 0 : GAP / 2;
    for (let x = 0; x < 18; x++) {
      rows.push(
        <View
          key={`${x}-${y}`}
          style={{
            position: 'absolute',
            left: x * GAP + offset,
            top: y * GAP,
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: theme.colors.turquoise,
            opacity: 0.12,
          }}
        />,
      );
    }
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {rows}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
