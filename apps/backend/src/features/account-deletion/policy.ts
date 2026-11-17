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

/** Monotonic status transitions allowed for process lock. */
export function canStartProcessing(status: string): boolean {
  return status === 'requested' || status === 'failed';
}

export function canAcceptVerify(status: string): boolean {
  return status === 'pending_verification';
}
