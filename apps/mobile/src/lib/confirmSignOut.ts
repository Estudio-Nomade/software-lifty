import { Alert } from 'react-native';

/** Native confirm before explicit user logout. Cancel leaves session intact. */
export function confirmSignOut(run: () => void | Promise<void>): void {
  Alert.alert('Cerrar sesión', '¿Estás seguro de que querés cerrar sesión?', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Cerrar sesión',
      style: 'destructive',
      onPress: () => {
        void run();
      },
    },
  ]);
}
