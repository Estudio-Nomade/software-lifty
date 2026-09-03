import type React from 'react';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

/** Legacy home route — redirects to Active (unified fullscreen map home). */
export const OnlineScreen: React.FC = () => {
  const navigation = useAppNavigation();

  useEffect(() => {
    navigation.replace('Active');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.turquoise} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
