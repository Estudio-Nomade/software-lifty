import type React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface StarRatingProps {
  rating: number;
  onRate?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onRate,
  size = 32,
  readonly = false,
}) => {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => {
            if (!readonly) onRate?.(star);
          }}
          activeOpacity={readonly ? 1 : 0.7}
          disabled={readonly}
          testID={`star-${star}`}
        >
          <Text style={[styles.star, { fontSize: size }]}>{star <= rating ? '★' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  star: {
    color: theme.colors.amber,
  },
});
