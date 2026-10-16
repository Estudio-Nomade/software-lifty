import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useTabBarVisibility } from '../context/TabBarVisibilityContext';
import { nextTabBarVisibility } from '../lib/tabBarScrollVisibility';

/**
 * Wire a ScrollView/FlatList `onScroll` to the root floating TabBar visibility.
 * Home/map screens should not call this (bar stays visible).
 */
export function useTabBarScrollVisibility() {
  const { visible, setVisible } = useTabBarVisibility();
  const prevOffsetY = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const result = nextTabBarVisibility(
        prevOffsetY.current,
        {
          offsetY: contentOffset.y,
          layoutHeight: layoutMeasurement.height,
          contentHeight: contentSize.height,
        },
        visibleRef.current,
      );
      prevOffsetY.current = result.nextOffsetY;
      if (result.visible !== visibleRef.current) {
        setVisible(result.visible);
      }
    },
    [setVisible],
  );

  return { onScroll };
}
