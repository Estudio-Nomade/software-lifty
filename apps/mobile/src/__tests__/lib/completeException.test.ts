import {
  COMPLETE_EXCEPTION_MAX_M,
  COMPLETE_EXCEPTION_NOTE_MAX,
  COMPLETE_EXCEPTION_REASONS,
  COMPLETE_OK_RADIUS_M,
  completeExceptionReasonLabel,
  isCompleteExceptionReason,
} from '../../lib/completeException';

describe('completeException', () => {
  it('locks product radii and note max to pack A values', () => {
    expect(COMPLETE_OK_RADIUS_M).toBe(100);
    expect(COMPLETE_EXCEPTION_MAX_M).toBe(400);
    expect(COMPLETE_EXCEPTION_NOTE_MAX).toBe(200);
  });

  it('maps allow-listed reasons to Spanish labels', () => {
    expect(completeExceptionReasonLabel('passenger_requested_elsewhere')).toBe(
      'El pasajero pidió otra ubicación',
    );
    expect(completeExceptionReasonLabel('destination_inaccessible')).toBe('Destino inaccesible');
    expect(completeExceptionReasonLabel('gps_unreliable')).toBe('Problemas de GPS');
    expect(completeExceptionReasonLabel('other')).toBe('Otro');
  });

  it('validates exception reason codes', () => {
    for (const reason of COMPLETE_EXCEPTION_REASONS) {
      expect(isCompleteExceptionReason(reason)).toBe(true);
    }
    expect(isCompleteExceptionReason('not_a_reason')).toBe(false);
    expect(isCompleteExceptionReason(null)).toBe(false);
  });
});
