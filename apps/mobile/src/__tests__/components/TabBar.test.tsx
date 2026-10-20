import { render } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';
import { TabBar } from '../../components/TabBar';
import { TabBarVisibilityProvider } from '../../context/TabBarVisibilityContext';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HORIZONTAL_INSET } from '../../lib/tabBarLayout';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/profile',
}));

beforeAll(() => {
  jest.spyOn(Animated, 'timing').mockImplementation(((value: Animated.Value, config: { toValue: number }) => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      value.setValue(config.toValue);
      cb?.({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  })) as typeof Animated.timing);
  jest.spyOn(Animated, 'parallel').mockImplementation(((animations: { start: (cb?: (r: { finished: boolean }) => void) => void }[]) => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      for (const a of animations) a.start();
      cb?.({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  })) as typeof Animated.parallel);
});

afterAll(() => {
  jest.restoreAllMocks();
});

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
