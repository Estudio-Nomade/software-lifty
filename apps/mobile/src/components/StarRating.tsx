import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';

interface StarRatingProps {
  rating: number;
  onRate: (rating: number) => void;
  size?: number;
}

export const StarRating: React.FC<StarRatingProps> = ({ rating, onRate, size = 32 }) => {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onRate(star)}
          activeOpacity={0.7}
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
