/**
 * Bottom sheet geometry: height grows upward from above the tab bar.
 * Collapsed = short strip only (no bulk under tabs). Expanded = taller box.
 *
 * Historical bugs:
 * 1) `SCREEN_HEIGHT - collapsed` assumed top-anchored layout and hid the sheet.
 * 2) Baking tabBar into snap heights + bottom:0 put content under the tab bar.
 * 3) Fixed expanded height + translateY tucked gray bulk under the floating tab bar.
 */

/**
 * @deprecated Prefer animating height directly. Kept for tests / callers that
 * still reason about the old translate range (expanded - collapsed).
 */
export function bottomSheetTranslateRange(
  collapsedHeight: number,
  expandedHeight: number,
): { collapsedTranslateY: number; expandedTranslateY: number } {
  const collapsed = Math.max(0, collapsedHeight);
  const expanded = Math.max(expandedHeight, collapsed);
  return {
    collapsedTranslateY: Math.max(0, expanded - collapsed),
    expandedTranslateY: 0,
  };
}

/** Expanded height ≈ half the map area above the tab bar. */
export function bottomSheetExpandedHeight(
  screenHeight: number,
  bottomOffset: number,
  fraction = 0.5,
): number {
  const mapArea = Math.max(0, screenHeight - bottomOffset);
  return Math.round(mapArea * fraction);
}
