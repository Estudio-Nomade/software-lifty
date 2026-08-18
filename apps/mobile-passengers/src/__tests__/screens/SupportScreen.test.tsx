import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import { SupportScreen } from '../../screens/SupportScreen';

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }),
}));

describe('SupportScreen', () => {
  test('renders title and mail CTA', async () => {
    const { getByText } = await render(<SupportScreen />);

    expect(getByText('Soporte')).toBeTruthy();
    expect(getByText('Enviar un email')).toBeTruthy();
    expect(getByText('admin@liftyviajes.com')).toBeTruthy();
  });

  test('mail CTA opens prefilled mailto link', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    const { getByText } = await render(<SupportScreen />);

    await act(async () => {
      fireEvent.press(getByText('Enviar un email'));
    });

    const url = openUrl.mock.calls[0][0];
    expect(url.startsWith('mailto:admin@liftyviajes.com')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Reporte de error');

    openUrl.mockRestore();
  });

  test('WhatsApp CTA opens prefilled wa.me link', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    const { getByText } = await render(<SupportScreen />);

    await act(async () => {
      fireEvent.press(getByText('WhatsApp'));
    });

    const url = openUrl.mock.calls[0][0];
    expect(url).toContain('wa.me/2266515776');
    expect(url).toContain('text=');
    expect(decodeURIComponent(url)).toContain('necesito ayuda');

    openUrl.mockRestore();
  });
});
