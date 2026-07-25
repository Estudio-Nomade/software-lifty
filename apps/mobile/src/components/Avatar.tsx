import type React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface AvatarProps {
  uri: string | null;
  name: string;
  size: number;
}

export const Avatar: React.FC<AvatarProps> = ({ uri, name, size }) => {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        testID="avatar-image"
      />
    );
  }

  const initial = name.charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      testID="avatar-fallback"
    >
      <Text style={[styles.initialText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
  },
});
