import { nextTabBarVisibility } from '../../lib/tabBarScrollVisibility';
import { getTabBarReserve, TAB_BAR_BOTTOM_GAP, TAB_BAR_PILL_HEIGHT } from '../../lib/tabBarLayout';

describe('nextTabBarVisibility', () => {
  const layout = { layoutHeight: 600, contentHeight: 2000 };

  test('scroll down past threshold hides', () => {
    const r = nextTabBarVisibility(0, { offsetY: 40, ...layout }, true);
    expect(r.visible).toBe(false);
  });

  test('scroll down hides even when already near bottom', () => {
    // Was stuck visible on short profile lists: bottom check ran before direction.
    const r = nextTabBarVisibility(
      1320,
      { offsetY: 1340, layoutHeight: 600, contentHeight: 2000 },
      true,
    );
    expect(r.visible).toBe(false);
  });

  test('scroll up past threshold shows', () => {
    const r = nextTabBarVisibility(100, { offsetY: 60, ...layout }, false);
    expect(r.visible).toBe(true);
  });

  test('at top always shows', () => {
    const r = nextTabBarVisibility(50, { offsetY: 0, ...layout }, false);
    expect(r.visible).toBe(true);
  });

  test('settled at bottom shows', () => {
    const r = nextTabBarVisibility(
      1380,
      {
        offsetY: 1382,
        layoutHeight: 600,
        contentHeight: 2000,
      },
      false,
    );
    expect(r.visible).toBe(true);
  });

  test('small jitter keeps previous visibility', () => {
    const r = nextTabBarVisibility(100, { offsetY: 105, ...layout }, true);
    expect(r.visible).toBe(true);
  });
});

describe('getTabBarReserve', () => {
  test('includes pill + gap + safe inset', () => {
    expect(getTabBarReserve(34)).toBe(TAB_BAR_PILL_HEIGHT + TAB_BAR_BOTTOM_GAP + 34);
  });

  test('floors inset at 8', () => {
    expect(getTabBarReserve(0)).toBe(TAB_BAR_PILL_HEIGHT + TAB_BAR_BOTTOM_GAP + 8);
  });
});
