import type React from 'react';
import { useEffect } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

/**
 * Deep-link / legacy route: review drivers now use the map home (Active).
 * Keep this screen so `/waiting-approval` still resolves without a blank stack.
 */
export const WaitingApprovalScreen: React.FC = () => {
  const navigation = useAppNavigation();

  useEffect(() => {
    navigation.replace('Active');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <ActivityIndicator size="large" color={theme.colors.turquoise} />
      <Text style={styles.hint}>Cargando inicio…</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  hint: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
});
