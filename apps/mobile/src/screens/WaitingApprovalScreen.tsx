import type React from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const WaitingApprovalScreen: React.FC = () => {
  const navigation = useAppNavigation();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Revision" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.clockIcon}>⏳</Text>
        </View>
        <Text style={styles.title}>Tus datos fueron enviados</Text>
        <Text style={styles.subtitle}>
          Un administrador revisará tu información y documentos. Te notificaremos cuando tu cuenta
          esté aprobada.
        </Text>
      </View>
      <Button
        title="Salir"
        variant="secondary"
        onPress={() => BackHandler.exitApp()}
        style={styles.exitButton}
      />
      {__DEV__ && (
        <Button
          title="Saltar >> Online (DEV)"
          variant="cta"
          onPress={() => navigation.replace('Active')}
          style={styles.exitButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0, 194, 179, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 24,
  },
  exitButton: {
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
});
