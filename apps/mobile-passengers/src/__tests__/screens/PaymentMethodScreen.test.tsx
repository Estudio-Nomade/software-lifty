import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { PaymentMethodScreen } from '../../screens/PaymentMethodScreen';
import { usePaymentStore } from '../../store/paymentStore';

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }),
}));

const DEFAULT_CASH = { id: 'cash', type: 'cash', label: 'Efectivo', isDefault: true };

describe('PaymentMethodScreen', () => {
  beforeEach(() => {
    usePaymentStore.setState({ methods: [DEFAULT_CASH] });
  });

  test('cash default is visible in the list', async () => {
    const { getByText } = await render(<PaymentMethodScreen />);

    expect(getByText('Efectivo')).toBeTruthy();
    expect(getByText('Default')).toBeTruthy();
  });

  test('tapping Agregar opens the form', async () => {
    const { getByText, getByPlaceholderText } = await render(<PaymentMethodScreen />);

    await act(async () => {
      fireEvent.press(getByText('Agregar método de pago'));
    });

    expect(getByPlaceholderText('Alias')).toBeTruthy();
    expect(getByPlaceholderText('CBU / CVU')).toBeTruthy();
  });

  test('adding a valid transfer shows it in the list', async () => {
    const { getByText, getByPlaceholderText } = await render(<PaymentMethodScreen />);

    await act(async () => {
      fireEvent.press(getByText('Agregar método de pago'));
    });

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Alias'), 'Mi Cuenta');
      fireEvent.changeText(getByPlaceholderText('CBU / CVU'), '0123456789012345678901');
      fireEvent.changeText(getByPlaceholderText('Titular'), 'Juan Perez');
    });

    await act(async () => {
      fireEvent.press(getByText('Agregar'));
    });

    expect(getByText('Mi Cuenta')).toBeTruthy();
  });
});
