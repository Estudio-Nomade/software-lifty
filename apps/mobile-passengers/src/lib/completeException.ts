/** Mirrors driver `completeException` labels — history display parity only. */

export const COMPLETE_EXCEPTION_REASONS = [
  'passenger_requested_elsewhere',
  'destination_inaccessible',
  'gps_unreliable',
  'other',
] as const;

export type CompleteExceptionReason = (typeof COMPLETE_EXCEPTION_REASONS)[number];

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
