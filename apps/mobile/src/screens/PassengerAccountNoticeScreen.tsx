import type React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

/**
 * Shown after login when the person already has a passenger account (same login)
 * but no driver profile yet. Driver onboarding only starts if they choose to continue.
 */
export const PassengerAccountNoticeScreen: React.FC = () => {
  const navigation = useAppNavigation();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Ya tenés una cuenta de pasajero</Text>
      <Text style={styles.description}>
        Usás el mismo usuario en Lifty Pasajeros. ¿Querés además ser conductor? Vamos a pedirte
        algunos datos y verificar tu identidad.
      </Text>
      <Button
        title="SER CONDUCTOR TAMBIÉN"
        onPress={() => navigation.replace('OnboardingStep1')}
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.white,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.md,
  },
});
