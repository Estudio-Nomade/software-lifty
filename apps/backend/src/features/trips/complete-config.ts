export const COMPLETE_EXCEPTION_REASONS = [
  'passenger_requested_elsewhere',
  'destination_inaccessible',
  'gps_unreliable',
  'other',
] as const;

export type CompleteExceptionReason = (typeof COMPLETE_EXCEPTION_REASONS)[number];

export type CompletionType = 'normal' | 'exception';

/** Max meters from dest for a normal complete (no exception reason). */
export const COMPLETE_OK_RADIUS_M = Number(process.env.COMPLETE_OK_RADIUS_M) || 100;

/**
 * Max meters from dest when an allow-listed exception reason is provided.
 * Beyond this: hard TOO_FAR unless non-prod BYPASS_DISTANCE_CHECK=true
 * (bypass still requires allow-listed reason + note if other).
 */
export const COMPLETE_EXCEPTION_MAX_M = Number(process.env.COMPLETE_EXCEPTION_MAX_M) || 400;

export const COMPLETE_EXCEPTION_NOTE_MAX = 200;

export function isCompleteExceptionReason(value: unknown): value is CompleteExceptionReason {
  return (
    typeof value === 'string' && (COMPLETE_EXCEPTION_REASONS as readonly string[]).includes(value)
  );
}
