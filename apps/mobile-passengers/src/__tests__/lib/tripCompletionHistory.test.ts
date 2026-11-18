import {
  COMPLETION_BADGE_EXCEPTION,
  COMPLETION_BADGE_NORMAL,
  COMPLETION_SECTION_TITLE,
  buildCompletionHistoryView,
  formatCompletedDistanceLine,
  shouldShowCompletionSection,
} from '../../lib/tripCompletionHistory';

describe('tripCompletionHistory', () => {
  it('hides section for non-terminal and legacy null evidence', () => {
    expect(
      shouldShowCompletionSection({
        status: 'in_trip',
        completion_type: 'normal',
        completed_distance_m: 10,
      }),
    ).toBe(false);
    expect(
      shouldShowCompletionSection({
        status: 'completed',
        completion_type: null,
        completed_at: null,
        completed_distance_m: null,
      }),
    ).toBe(false);
  });

  it('shows section when any evidence field is present', () => {
    expect(
      shouldShowCompletionSection({ status: 'completed', completion_type: 'normal' }),
    ).toBe(true);
    expect(
      shouldShowCompletionSection({ status: 'rated', completed_at: '2026-11-18T12:00:00Z' }),
    ).toBe(true);
    expect(
      shouldShowCompletionSection({ status: 'completed', completed_distance_m: 42 }),
    ).toBe(true);
  });

  it('formats distance and builds normal view with parity copy', () => {
    expect(formatCompletedDistanceLine(41.6)).toBe('42 m del pin');
    expect(formatCompletedDistanceLine(null)).toBeNull();

    const view = buildCompletionHistoryView({
      status: 'completed',
      completion_type: 'normal',
      completed_distance_m: 12.2,
    });
    expect(view).toEqual({
      title: COMPLETION_SECTION_TITLE,
      badge: { label: COMPLETION_BADGE_NORMAL, kind: 'normal' },
      reasonLine: null,
      noteLine: null,
      distanceLine: '12 m del pin',
    });
  });

  it('builds exception view with badge, reason label and note', () => {
    const view = buildCompletionHistoryView({
      status: 'rated',
      completion_type: 'exception',
      completed_distance_m: 185.4,
      completion_exception_reason: 'passenger_requested_elsewhere',
      completion_exception_note: '  bajó en la esquina  ',
    });
    expect(view).toEqual({
      title: COMPLETION_SECTION_TITLE,
      badge: { label: COMPLETION_BADGE_EXCEPTION, kind: 'exception' },
      reasonLine: 'El pasajero pidió otra ubicación',
      noteLine: 'bajó en la esquina',
      distanceLine: '185 m del pin',
    });
  });
});
