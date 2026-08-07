import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

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
    backgroundColor: 'rgba(27, 191, 174, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(27, 191, 174, 0.25)',
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
    color: theme.colors.mediumGray,
  },
  sponsor: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.turquoise,
  },
});
