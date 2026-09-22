jest.mock('../../hooks/useAuth', () => ({
  useSignUp: jest.fn(),
  useVerifyEmail: jest.fn(),
  useLogin: jest.fn(),
  useSignOut: jest.fn(),
}));

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  };
  return {
    useRouter: jest.fn(() => router),
    useSegments: jest.fn(() => []),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
    },
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { LoginPhoneScreen } from '../../screens/LoginPhoneScreen';
import { useAuthStore } from '../../store/authStore';

async function renderScreen() {
  return await render(<LoginPhoneScreen />);
}

describe('LoginPhoneScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ phone: null });
  });

  it('disables the button when phone input is empty', async () => {
    const { getByText } = await renderScreen();

    const button = getByText('CONTINUAR');
    expect(button.parent?.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables the button when phone input has 10+ digits', async () => {
    const { getByText, getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.changeText(getByTestId('phone-input'), '91123456789');
    });

    const button = getByText('CONTINUAR');
    expect(button.parent?.props.accessibilityState?.disabled).toBe(false);
  }, 25000);

  it('shows deprecation message when button is pressed', async () => {
    const { getByText, getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.changeText(getByTestId('phone-input'), '91123456789');
    });

    await act(async () => {
      fireEvent.press(getByText('CONTINUAR').parent!);
    });

    const errorText = getByText(
      'El inicio de sesion por telefono ya no esta disponible. Usa email.',
    );
    expect(errorText).toBeTruthy();
  });
});
