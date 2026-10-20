export type TabBarScrollMetrics = {
  offsetY: number;
  layoutHeight: number;
  contentHeight: number;
};

export type TabBarScrollVisibilityOptions = {
  /** Min |dy| to count as intentional scroll (px). */
  threshold?: number;
  /** Near top of list → always show. */
  topSlack?: number;
  /** Near bottom of list → show (only when not actively scrolling down). */
  bottomSlack?: number;
};

const DEFAULT_THRESHOLD = 8;
const DEFAULT_TOP_SLACK = 8;
const DEFAULT_BOTTOM_SLACK = 48;

/**
 * Pure Uber-like tab bar visibility from scroll metrics.
 * - scroll down past threshold → hide (priority over near-bottom)
 * - scroll up past threshold → show
 * - at top → show
 * - settled near bottom → show
 */
export function nextTabBarVisibility(
  prevOffsetY: number,
  metrics: TabBarScrollMetrics,
  currentlyVisible: boolean,
  options: TabBarScrollVisibilityOptions = {},
): { visible: boolean; nextOffsetY: number } {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const topSlack = options.topSlack ?? DEFAULT_TOP_SLACK;
  const bottomSlack = options.bottomSlack ?? DEFAULT_BOTTOM_SLACK;

  const { offsetY, layoutHeight, contentHeight } = metrics;
  const y = Math.max(0, offsetY);
  const dy = y - prevOffsetY;
  const overflow = contentHeight - layoutHeight;
  const canScroll = overflow > threshold;
  const distanceFromBottom = contentHeight - (y + layoutHeight);
  const nearBottom = canScroll && distanceFromBottom <= bottomSlack;

  if (y <= topSlack) {
    return { visible: true, nextOffsetY: y };
  }

  // Direction first: short lists hit "near bottom" almost immediately otherwise.
  if (dy > threshold) {
    return { visible: false, nextOffsetY: y };
  }
  if (dy < -threshold) {
    return { visible: true, nextOffsetY: y };
  }

  if (nearBottom) {
    return { visible: true, nextOffsetY: y };
  }

  return { visible: currentlyVisible, nextOffsetY: y };
}
