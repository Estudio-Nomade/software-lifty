import { render } from '@testing-library/react-native';
import React from 'react';
import { TabBar } from '../../components/TabBar';
import { TabBarVisibilityProvider } from '../../context/TabBarVisibilityContext';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HORIZONTAL_INSET } from '../../lib/tabBarLayout';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/profile',
}));

function wrap(ui: React.ReactElement) {
  return <TabBarVisibilityProvider>{ui}</TabBarVisibilityProvider>;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style as Record<string, unknown>;
}

describe('TabBar', () => {
  test('renders floating shell with inset props', async () => {
    const { getByTestId } = await render(wrap(<TabBar activeTab="home" onTabPress={() => {}} />));
    const style = flattenStyle(getByTestId('driver-tab-bar').props.style);
    expect(style.left).toBe(TAB_BAR_HORIZONTAL_INSET);
    expect(style.right).toBe(TAB_BAR_HORIZONTAL_INSET);
    expect(style.bottom).toBe(TAB_BAR_BOTTOM_GAP + 34);
  });

  test('renders all four tabs', async () => {
    const { getByText } = await render(wrap(<TabBar activeTab="home" onTabPress={() => {}} />));
    expect(getByText('Inicio')).toBeTruthy();
    expect(getByText('Cobros')).toBeTruthy();
    expect(getByText('Viajes')).toBeTruthy();
    expect(getByText('Perfil')).toBeTruthy();
  });
});
