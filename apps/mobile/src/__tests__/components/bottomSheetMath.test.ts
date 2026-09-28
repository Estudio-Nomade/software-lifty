import {
  bottomSheetExpandedHeight,
  bottomSheetTranslateRange,
} from '../../components/bottomSheetMath';

describe('bottomSheetTranslateRange', () => {
  test('collapsed is expanded-collapsed (bottom-anchored above tab bar)', () => {
    const collapsed = 160;
    const expanded = 400;
    const { collapsedTranslateY, expandedTranslateY } = bottomSheetTranslateRange(
      collapsed,
      expanded,
    );

    expect(expandedTranslateY).toBe(0);
    expect(collapsedTranslateY).toBe(240);
    // Visible strip above tab bar equals collapsed height.
    expect(expanded - collapsedTranslateY).toBe(collapsed);
  });

  test('never negative when expanded equals collapsed', () => {
    const { collapsedTranslateY, expandedTranslateY } = bottomSheetTranslateRange(300, 300);
    expect(collapsedTranslateY).toBe(0);
    expect(expandedTranslateY).toBe(0);
  });

  test('if expanded < collapsed, clamp expanded up so range stays valid', () => {
    const { collapsedTranslateY, expandedTranslateY } = bottomSheetTranslateRange(400, 200);
    expect(expandedTranslateY).toBe(0);
    expect(collapsedTranslateY).toBe(0);
  });
});

describe('bottomSheetExpandedHeight', () => {
  test('is half the map area above the tab bar', () => {
    expect(bottomSheetExpandedHeight(800, 100, 0.5)).toBe(350);
  });

  test('never negative when offset exceeds screen', () => {
    expect(bottomSheetExpandedHeight(100, 200, 0.5)).toBe(0);
  });
});
