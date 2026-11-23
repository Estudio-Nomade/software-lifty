import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ApiError } from '../../api/types';
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
      fireEvent.press(getByText('Continuar'));
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
      fireEvent.press(getByText('Continuar'));
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

  test('maps legal-accept NOT_FOUND to Spanish copy (not raw code)', async () => {
    mockPostLegalAccept.mockRejectedValue(
      new ApiError({
        error: { code: 'NOT_FOUND', message: 'NOT_FOUND', status: 404 },
        meta: { timestamp: '2026-11-23T00:00:00.000Z' },
      }),
    );

    const { getByText, getByLabelText, queryByText } = await render(<TermsScreen />);

    await act(async () => {
      fireEvent.press(
        getByLabelText(
          'He leído y acepto los Términos y Condiciones y la Política de Privacidad',
        ),
      );
    });
    await act(async () => {
      fireEvent.press(getByText('Continuar'));
    });

    expect(queryByText('NOT_FOUND')).toBeNull();
    expect(
      getByText(
        'No pudimos registrar tu aceptación. Probá de nuevo; si sigue, cerrá sesión y volvé a entrar.',
      ),
    ).toBeTruthy();
    expect(useAuthStore.getState().termsAccepted).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
