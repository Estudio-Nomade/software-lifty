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

const mockUpdateProfile = jest.fn().mockResolvedValue({
  id: 'p1',
  full_name: 'Nuevo Nombre',
  phone: '+5492611111111',
  email: 'maria@example.com',
});
const mockUploadProfilePhoto = jest.fn().mockResolvedValue({
  file_url: 'https://example.com/a.jpg',
  avatar_url: 'https://example.com/a.jpg',
});

jest.mock('../../api/passenger', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'p1',
    full_name: 'Maria Lopez',
    phone: '+5492611111111',
    email: 'maria@example.com',
  }),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  uploadProfilePhoto: (...args: unknown[]) => mockUploadProfilePhoto(...args),
}));

jest.mock('../../utils/image', () => ({
  compressImage: jest.fn(async (uri: string) => ({ uri })),
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

  test('save failure shows friendly phone-taken message, not connection lie', async () => {
    mockUpdateProfile.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error: {
            code: 'PHONE_TAKEN',
            message: 'Ese teléfono ya está registrado en otra cuenta.',
          },
        },
      },
    });

    const { getByText } = await render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(getByText('Editar perfil'));
    });
    await act(async () => {
      fireEvent.press(getByText('Guardar'));
    });

    expect(Alert.alert).toHaveBeenCalled();
    const [, message] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string];
    expect(message).toMatch(/tel[eé]fono/i);
    expect(message.toLowerCase()).not.toContain('conexión');
  });
});
