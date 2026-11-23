import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { TermsScreen } from '../../screens/TermsScreen';
import { useAuthStore } from '../../store/authStore';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({
    navigate: jest.fn(),
    replace: mockReplace,
    goBack: mockGoBack,
  }),
}));

jest.mock('../../components/Navbar', () => ({
  Navbar: ({ title }: { title?: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

const mockPostLegalAccept = jest.fn();
jest.mock('../../legal/legalConsent', () => ({
  postLegalAccept: (...args: unknown[]) => mockPostLegalAccept(...args),
  isCurrentLegalAccepted: jest.fn(),
}));

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePostAuthRoute: jest.fn(async () => ({ screen: 'OnboardingStep1' })),
}));

const mockUseLocalSearchParams = jest.fn(() => ({} as { from?: string }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('TermsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({});
    mockPostLegalAccept.mockResolvedValue(undefined);
    useAuthStore.setState({ termsAccepted: false });
  });

  test('CTA disabled without checkbox; enabled after check and POSTs accept', async () => {
    const { getByText, getByLabelText } = await render(<TermsScreen />);

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR Y CONTINUAR'));
    });
    expect(mockPostLegalAccept).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(
        getByLabelText(
          'He leído y acepto los Términos y Condiciones y la Política de Privacidad',
        ),
      );
    });

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR Y CONTINUAR'));
    });

    expect(mockPostLegalAccept).toHaveBeenCalled();
    expect(useAuthStore.getState().termsAccepted).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('OnboardingStep1');
  });

  test('read mode shows VOLVER without checkbox requirement', async () => {
    mockUseLocalSearchParams.mockReturnValue({ from: 'profile' });
    useAuthStore.setState({ termsAccepted: true });

    const { getByText, queryByLabelText } = await render(<TermsScreen />);

    expect(getByText('VOLVER')).toBeTruthy();
    expect(
      queryByLabelText(
        'He leído y acepto los Términos y Condiciones y la Política de Privacidad',
      ),
    ).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('VOLVER'));
    });
    expect(mockGoBack).toHaveBeenCalled();
    expect(mockPostLegalAccept).not.toHaveBeenCalled();
  });
});
