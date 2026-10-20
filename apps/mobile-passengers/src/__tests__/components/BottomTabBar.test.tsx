import { render } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';
import { BottomTabBar } from '../../components/BottomTabBar';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HORIZONTAL_INSET } from '../../lib/tabBarLayout';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn() }),
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

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style as Record<string, unknown>;
}

describe('BottomTabBar', () => {
  test('renders floating shell with inset props', async () => {
    const { getByTestId } = await render(<BottomTabBar activeTab="home" />);
    const style = flattenStyle(getByTestId('bottom-tab-bar').props.style);
    expect(style.left).toBe(TAB_BAR_HORIZONTAL_INSET);
    expect(style.right).toBe(TAB_BAR_HORIZONTAL_INSET);
    expect(style.bottom).toBe(TAB_BAR_BOTTOM_GAP + 34);
  });

  test('renders all four tabs', async () => {
    const { getByText } = await render(<BottomTabBar activeTab="home" />);
    expect(getByText('Inicio')).toBeTruthy();
    expect(getByText('Buscar')).toBeTruthy();
    expect(getByText('Viajes')).toBeTruthy();
    expect(getByText('Perfil')).toBeTruthy();
  });

  test('hidden sets pointerEvents none', async () => {
    const { getByTestId } = await render(<BottomTabBar activeTab="home" visible={false} />);
    expect(getByTestId('bottom-tab-bar').props.pointerEvents).toBe('none');
  });
});
