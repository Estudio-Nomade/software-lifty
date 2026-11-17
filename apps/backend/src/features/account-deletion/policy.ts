/** Live trip statuses that block deletion until resolved. */
export const ACTIVE_TRIP_STATUSES = [
  'pending',
  'offered',
  'request_received',
  'accepted',
  'en_route',
  'waiting',
  'in_trip',
] as const;

export type ActiveTripStatus = (typeof ACTIVE_TRIP_STATUSES)[number];

export const TERMINAL_TRIP_STATUSES = [
  'completed',
  'rated',
  'cancelled',
  'cancelled_early',
  'cancelled_late',
  'rejected',
  'expired',
] as const;

export type DeletionSource = 'app' | 'web';

export type DeletionStatus =
  | 'pending_verification'
  | 'requested'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';

export const STAFF_ROLES = new Set(['admin', 'transit']);

export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role);
}

export function isActiveTripStatus(status: string): boolean {
  return (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const WEB_GENERIC_MESSAGE =
  'Si existe una cuenta asociada, enviamos un email con instrucciones.';

/**
 * What to delete vs retain for a full identity wipe (passenger and/or driver).
 * Dual-role = same wipe — never role-scoped in v1.
 */
export type WipeScope = {
  deletePassengerProfile: boolean;
  deleteDriverGraph: boolean;
  retainDebtAndAccounting: boolean;
  anonymizeTrips: boolean;
};

export function wipeScopeForRoles(opts: {
  hasPassenger: boolean;
  hasDriver: boolean;
}): WipeScope {
  return {
    deletePassengerProfile: opts.hasPassenger,
    deleteDriverGraph: opts.hasDriver,
    retainDebtAndAccounting: true,
    anonymizeTrips: true,
  };
}

/** Default minutes before a `processing` lock is considered stale and re-entrant. */
export function processingStaleLockMs(): number {
  const n = Number(process.env.ACCOUNT_DELETION_STALE_LOCK_MIN);
  const minutes = Number.isFinite(n) && n > 0 ? n : 15;
  return minutes * 60_000;
}

export function isStaleProcessingLock(
  status: string,
  processingStartedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'processing') return false;
  if (!processingStartedAt) return true;
  return now.getTime() - processingStartedAt.getTime() >= processingStaleLockMs();
}

/**
 * Monotonic start statuses, plus stale `processing` so a crashed worker can recover.
 */
export function canStartProcessing(
  status: string,
  opts?: { processingStartedAt?: Date | null; now?: Date },
): boolean {
  if (status === 'requested' || status === 'failed') return true;
  if (status === 'processing' && opts) {
    return isStaleProcessingLock(status, opts.processingStartedAt, opts.now ?? new Date());
  }
  return false;
}

export function canAcceptVerify(status: string): boolean {
  return status === 'pending_verification';
}
