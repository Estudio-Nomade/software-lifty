/** Mirrors BE pack A `complete-config.ts` — client copy / allow-list only; BE decides. */

export const COMPLETE_EXCEPTION_REASONS = [
  'passenger_requested_elsewhere',
  'destination_inaccessible',
  'gps_unreliable',
  'other',
] as const;

export type CompleteExceptionReason = (typeof COMPLETE_EXCEPTION_REASONS)[number];

/** Product lock normal arrival radius (m). Same as BE `COMPLETE_OK_RADIUS_M`. */
export const COMPLETE_OK_RADIUS_M = 100;

/** Product lock hard far ceiling (m). Same as BE `COMPLETE_EXCEPTION_MAX_M`. */
export const COMPLETE_EXCEPTION_MAX_M = 400;

/** Same as BE `COMPLETE_EXCEPTION_NOTE_MAX`. */
export const COMPLETE_EXCEPTION_NOTE_MAX = 200;

export const COMPLETE_EXCEPTION_REASON_LABELS: Record<CompleteExceptionReason, string> = {
  passenger_requested_elsewhere: 'El pasajero pidió otra ubicación',
  destination_inaccessible: 'Destino inaccesible',
  gps_unreliable: 'Problemas de GPS',
  other: 'Otro',
};

export function completeExceptionReasonLabel(reason: CompleteExceptionReason): string {
  return COMPLETE_EXCEPTION_REASON_LABELS[reason];
}

export function isCompleteExceptionReason(value: unknown): value is CompleteExceptionReason {
  return (
    typeof value === 'string' && (COMPLETE_EXCEPTION_REASONS as readonly string[]).includes(value)
  );
}
