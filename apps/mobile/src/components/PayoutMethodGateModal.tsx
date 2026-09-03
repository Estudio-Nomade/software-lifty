import type React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './Button';
import { Text } from './ui/Text';

interface PayoutMethodGateModalProps {
  visible: boolean;
  onAddMethod: () => void;
  onLogout: () => void;
}

export const PayoutMethodGateModal: React.FC<PayoutMethodGateModalProps> = ({
  visible,
  onAddMethod,
  onLogout,
}) => {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Necesitamos tu medio de cobro</Text>
          <Text style={styles.body}>
            Para pagarte los viajes, cargá un CBU/CVU con alias (y banco o wallet si querés). Sin
            eso no podés conectarte.
          </Text>
          <Button title="CARGAR MEDIO DE COBRO" onPress={onAddMethod} style={styles.primary} />
          <Button
            title="CERRAR SESIÓN"
            variant="secondary"
            onPress={onLogout}
            style={styles.secondary}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 42, 68, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  primary: {
    width: '100%',
  },
  secondary: {
    width: '100%',
  },
});
