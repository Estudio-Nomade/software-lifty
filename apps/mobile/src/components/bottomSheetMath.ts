/**
 * Bottom sheet geometry when the sheet is bottom-anchored
 * (`position: 'absolute', bottom: bottomOffset`) with fixed `height: expanded`.
 *
 * Collapsed = push the sheet down by (expanded - collapsed) so only the top
 * strip (handle + first children) stays on screen above the tab bar.
 * Expanded = translateY 0 (full expanded height visible above the tab bar).
 *
 * Historical bugs:
 * 1) `SCREEN_HEIGHT - collapsed` assumed top-anchored layout and hid the sheet.
 * 2) Baking tabBar into snap heights + bottom:0 put content under the tab bar
 *    and made drag feel stuck.
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
