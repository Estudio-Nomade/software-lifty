import type React from 'react';
import { StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const DNIScanScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            minHeight: theme.dimensions.navbarHeight + insets.top,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.closeButton}>✕ Cerrar</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.spacer} />
      <Text style={styles.instruction}>Escanea el frente de tu DNI</Text>
      <View style={styles.viewfinder}>
        <Text style={styles.viewfinderHint}>Colocar DNI aqui</Text>
      </View>
      <View style={styles.spacer} />
      <Text style={styles.hint}>
        Coloca el DNI dentro del recuadro.{'\n'}Asegurate de que tenga buena luz.
      </Text>
      <View style={styles.spacerLarge} />
      <Button
        title="Simular escaneo exitoso"
        variant="primary"
        onPress={() => navigation.navigate('Selfie')}
        style={styles.button}
      />
      <Text style={styles.brand}>Verificacion por DIDIT</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  spacer: {
    height: 8,
  },
  instruction: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  viewfinder: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    height: 240,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  viewfinderHint: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.sm,
  },
  hint: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    width: 280,
    marginTop: theme.spacing.md,
    lineHeight: 22,
  },
  spacerLarge: {
    height: 24,
  },
  button: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  brand: {
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.xs,
  },
});
