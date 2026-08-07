import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface SponsorBannerProps {
  sponsorName?: string;
  message?: string;
}

export const SponsorBanner: React.FC<SponsorBannerProps> = ({
  sponsorName = 'Lifty',
  message = 'Auspiciado por',
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🤝</Text>
      <View style={styles.textContainer}>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.sponsor}>{sponsorName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    width: 310,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  sponsor: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
});
