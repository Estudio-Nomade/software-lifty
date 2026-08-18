import { render } from '@testing-library/react-native';
import React from 'react';
import { BottomTabBar } from '../../components/BottomTabBar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn() }),
}));

describe('BottomTabBar', () => {
  test('extends paddingBottom to the bottom inset', async () => {
    const { getByTestId } = await render(<BottomTabBar activeTab="home" />);
    expect(getByTestId('bottom-tab-bar')).toHaveStyle({ paddingBottom: 34 });
  });

  test('renders all four tabs', async () => {
    const { getByText } = await render(<BottomTabBar activeTab="home" />);
    expect(getByText('Inicio')).toBeTruthy();
    expect(getByText('Buscar')).toBeTruthy();
    expect(getByText('Viajes')).toBeTruthy();
    expect(getByText('Perfil')).toBeTruthy();
  });
});
