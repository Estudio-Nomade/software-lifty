import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { TermsScreen } from '../../screens/TermsScreen';
import { useAuthStore } from '../../store/authStore';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: mockReplace, goBack: mockGoBack }),
}));

const mockUseLocalSearchParams = jest.fn(() => ({ from: 'profile' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('TermsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ from: 'profile' });
  });

  test('authenticated user reads terms and does not replace to LoginCredentials', async () => {
    useAuthStore.setState({ isAuthenticated: true });

    const { getByText } = await render(<TermsScreen />);

    expect(getByText('Volver')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Volver'));
    });

    expect(mockReplace).not.toHaveBeenCalledWith('LoginCredentials');
    expect(mockGoBack).toHaveBeenCalled();
  });

  test('registration mode accepts and replaces to LoginCredentials', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    mockUseLocalSearchParams.mockReturnValue({ from: 'register' });

    const { getByText } = await render(<TermsScreen />);

    await act(async () => {
      fireEvent.press(getByText('Aceptar'));
    });

    expect(mockReplace).toHaveBeenCalledWith('LoginCredentials');
  });
});
