import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { nextTabBarVisibility } from '../lib/tabBarScrollVisibility';

/**
 * Local scroll → floating BottomTabBar visibility (per screen).
 * Home/map: do not use — keep bar always visible.
 */
export function useTabBarScrollVisibility(initialVisible = true) {
  const [visible, setVisible] = useState(initialVisible);
  const prevOffsetY = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
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
  }, []);

  return { visible, onScroll, setVisible };
}
