import { Alert } from 'react-native';
import { confirmSignOut } from '../../lib/confirmSignOut';

describe('confirmSignOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('shows locked copy with cancel and destructive confirm', () => {
    const run = jest.fn();
    confirmSignOut(run);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0] as [
      string,
      string,
      Array<{ text: string; style?: string; onPress?: () => void }>,
    ];
    expect(title).toBe('Cerrar sesión');
    expect(body).toBe('¿Estás seguro de que querés cerrar sesión?');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ text: 'Cancelar', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: 'Cerrar sesión', style: 'destructive' });
    expect(run).not.toHaveBeenCalled();
  });

  it('does not run on cancel', () => {
    const run = jest.fn();
    confirmSignOut(run);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons[0].onPress?.();
    expect(run).not.toHaveBeenCalled();
  });

  it('runs once on confirm', () => {
    const run = jest.fn();
    confirmSignOut(run);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons[1].onPress?.();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
