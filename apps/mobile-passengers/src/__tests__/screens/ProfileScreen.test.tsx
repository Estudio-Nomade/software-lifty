import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';
import { ProfileScreen } from '../../screens/ProfileScreen';

const mockNavigate = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: mockNavigate, replace: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));

jest.mock('../../api/passenger', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'p1',
    full_name: 'Maria Lopez',
    phone: '+5492611111111',
    email: 'maria@example.com',
  }),
  updateProfile: jest.fn().mockResolvedValue({
    id: 'p1',
    full_name: 'Nuevo Nombre',
    phone: '+5492611111111',
    email: 'maria@example.com',
  }),
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  test('editar perfil opens edit modal instead of showing Próximamente alert', async () => {
    const { getByText, queryByText } = await render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(getByText('Editar perfil'));
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Editar perfil', 'Próximamente');
    expect(queryByText('Guardar')).toBeTruthy();
  });

  test('soporte navigates to Support instead of showing Próximamente alert', async () => {
    const { getByText } = await render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(getByText('Soporte'));
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Soporte', 'Próximamente');
    expect(mockNavigate).toHaveBeenCalledWith('Support');
  });

  test('términos navigates to Terms with from=profile', async () => {
    const { getByText } = await render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(getByText('Términos y condiciones'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Terms', { from: 'profile' });
  });

  test('sos opens prefilled SOS WhatsApp link', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    const { getByText } = await render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(getByText('SOS'));
    });

    const url = openUrl.mock.calls[0][0];
    expect(url.startsWith('https://wa.me/2266515776?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('SOS LIFTY');
  });
});
