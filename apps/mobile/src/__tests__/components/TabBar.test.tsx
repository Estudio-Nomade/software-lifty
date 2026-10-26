import { render } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';
import { TabBar } from '../../components/TabBar';
import { TabBarVisibilityProvider } from '../../context/TabBarVisibilityContext';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HORIZONTAL_INSET } from '../../lib/tabBarLayout';
import { useMessagesUnreadStore } from '../../store/messagesUnreadStore';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/profile',
}));

// Avoid expo-font / asset registry noise from real Ionicons glyphs in Jest.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: { name?: string; testID?: string }) =>
      React.createElement(
        Text,
        { testID: props.testID ?? `icon-${props.name}` },
        props.name ?? 'icon',
      ),
  };
});

beforeAll(() => {
  jest.spyOn(Animated, 'timing').mockImplementation(((
    value: Animated.Value,
    config: { toValue: number },
  ) => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      value.setValue(config.toValue);
      cb?.({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  })) as typeof Animated.timing);
  jest.spyOn(Animated, 'parallel').mockImplementation(((
    animations: { start: (cb?: (r: { finished: boolean }) => void) => void }[],
  ) => ({
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

beforeEach(() => {
  useMessagesUnreadStore.setState({ unreadCount: 0 });
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

  test('tab labels use theme.fontFamily (active semibold, inactive medium)', async () => {
    const { getByText } = await render(wrap(<TabBar activeTab="home" onTabPress={() => {}} />));
    const active = flattenStyle(getByText('Inicio').props.style);
    const inactive = flattenStyle(getByText('Cobros').props.style);
    expect(active.fontFamily).toBe('Inter_600SemiBold');
    expect(inactive.fontFamily).toBe('Inter_500Medium');
  });

  test('shows unread badge on Perfil tab when store has messages', async () => {
    useMessagesUnreadStore.setState({ unreadCount: 2 });
    const withUnread = await render(wrap(<TabBar activeTab="home" onTabPress={() => {}} />));

    // Badge is decorative (accessibilityElementsHidden); query with includeHiddenElements.
    const badge = withUnread.getByTestId('tab-profile-unread-badge', {
      includeHiddenElements: true,
    });
    expect(badge).toBeTruthy();
    const nested = Array.isArray(badge.props.children)
      ? badge.props.children[0]
      : badge.props.children;
    expect(nested?.props?.children).toBe('2');
    expect(withUnread.getByLabelText('Perfil tab, 2 mensajes sin leer')).toBeTruthy();
    withUnread.unmount();

    useMessagesUnreadStore.setState({ unreadCount: 0 });
    const cleared = await render(wrap(<TabBar activeTab="home" onTabPress={() => {}} />));
    expect(
      cleared.queryByTestId('tab-profile-unread-badge', { includeHiddenElements: true }),
    ).toBeNull();
  });
});
