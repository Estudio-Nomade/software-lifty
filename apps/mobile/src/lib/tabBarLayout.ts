import { theme } from '../theme';

/** Horizontal gap from screen edges (floating pill). */
export const TAB_BAR_HORIZONTAL_INSET = theme.spacing.md;

/** Gap between pill bottom and home-indicator / screen edge (before safe inset). */
export const TAB_BAR_BOTTOM_GAP = theme.spacing.sm;

/** Inner pill height (icons + labels). Safe-area is added separately. */
export const TAB_BAR_PILL_HEIGHT = theme.dimensions.tabBarHeight;

/**
 * Total bottom space content/sheets must reserve so the floating pill does not cover UI.
 * = pill height + bottom gap + max(safe inset, 8).
 */
export function getTabBarReserve(bottomInset: number): number {
  return TAB_BAR_PILL_HEIGHT + TAB_BAR_BOTTOM_GAP + Math.max(bottomInset, 8);
}
