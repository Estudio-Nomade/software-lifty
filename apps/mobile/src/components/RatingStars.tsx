import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface RatingStarsProps {
  rating: number;
  size?: number;
}

export const RatingStars: React.FC<RatingStarsProps> = ({ rating, size = 14 }) => {
  const clamped = Math.max(0, Math.min(5, rating));
  const fullStars = Math.floor(clamped);
  const totalStars = 5;
  const stars = '★'.repeat(fullStars) + '☆'.repeat(totalStars - fullStars);

  return (
    <View style={styles.container} testID="rating-stars">
      <Text style={[styles.stars, { fontSize: size, color: theme.colors.amber }]}>{stars}</Text>
      <Text style={[styles.value, { fontSize: size, color: theme.colors.amber }]}>
        {clamped.toFixed(1)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stars: {
    fontWeight: theme.fontWeight.normal,
  },
  value: {
    fontWeight: theme.fontWeight.medium,
  },
});
