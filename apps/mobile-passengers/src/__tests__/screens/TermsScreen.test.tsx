import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import {
  PRIVACY_POLICY_LABEL,
  PRIVACY_POLICY_URL,
  TERMS_FULL_LABEL,
  TERMS_URL,
} from '../../legal/legalUrls';
import { TermsScreen } from '../../screens/TermsScreen';
import { useAuthStore } from '../../store/authStore';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: mockReplace, goBack: mockGoBack }),
}));

const mockPostLegalAccept = jest.fn();
jest.mock('../../legal/legalConsent', () => ({
  postLegalAccept: (...args: unknown[]) => mockPostLegalAccept(...args),
  hydrateLegalConsentFromMe: jest.fn(),
  isCurrentLegalAccepted: jest.fn(),
}));

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePassengerPostAuthPath: jest.fn(async () => '/home'),
}));

const mockUseLocalSearchParams = jest.fn(() => ({ from: 'profile' as string | undefined }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('TermsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ from: 'profile' });
    mockPostLegalAccept.mockResolvedValue(undefined);
    useAuthStore.setState({
      isAuthenticated: false,
      termsAccepted: false,
      userId: null,
      token: null,
    });
  });

  test('authenticated user reads terms and does not replace to LoginCredentials', async () => {
    useAuthStore.setState({ isAuthenticated: true, termsAccepted: true });

    const { getByText, getAllByText } = await render(<TermsScreen />);

    expect(getByText('Volver')).toBeTruthy();
    expect(getByText(/1\.\s+Qué es Lifty/)).toBeTruthy();
    expect(getAllByText(/web\.liftyviajes\.com/).length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(getByText('Volver'));
    });

    expect(mockReplace).not.toHaveBeenCalledWith('LoginCredentials');
    expect(mockGoBack).toHaveBeenCalled();
  });

  test('accept mode: CTA no-op without checkbox; with checkbox advances unauth register', async () => {
    useAuthStore.setState({ isAuthenticated: false, termsAccepted: false });
    mockUseLocalSearchParams.mockReturnValue({ from: 'register' });

    const { getByText, getByLabelText } = await render(<TermsScreen />);

    expect(getByText(/resumen del borrador de Términos/i)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Aceptar'));
    });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(
        getByLabelText(
          'He leído y acepto los Términos y Condiciones y la Política de Privacidad',
        ),
      );
    });

    await act(async () => {
      fireEvent.press(getByText('Aceptar'));
    });

    expect(mockPostLegalAccept).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('LoginCredentials');
  });

  test('authenticated accept mode POSTs legal-accept', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      termsAccepted: false,
      userId: 'user-1',
      token: 't',
    });
    mockUseLocalSearchParams.mockReturnValue({});

    const { getByText, getByLabelText } = await render(<TermsScreen />);

    await act(async () => {
      fireEvent.press(
        getByLabelText(
          'He leído y acepto los Términos y Condiciones y la Política de Privacidad',
        ),
      );
    });

    await act(async () => {
      fireEvent.press(getByText('Aceptar'));
    });

    expect(mockPostLegalAccept).toHaveBeenCalled();
    expect(useAuthStore.getState().termsAccepted).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('Home');
  });

  test('opens privacy and full terms URLs without accepting', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    mockUseLocalSearchParams.mockReturnValue({ from: 'register' });
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    const { getByText, getByLabelText } = await render(<TermsScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(PRIVACY_POLICY_LABEL));
    });
    expect(openUrl).toHaveBeenCalledWith(PRIVACY_POLICY_URL);

    await act(async () => {
      fireEvent.press(getByLabelText(TERMS_FULL_LABEL));
    });
    expect(openUrl).toHaveBeenCalledWith(TERMS_URL);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(getByText('Aceptar')).toBeTruthy();

    openUrl.mockRestore();
  });
});
