export type CancelReason = 'user_cancel' | 'driver_cancel' | 'no_show' | 'auto_timeout';

export function isCancelledTripStatus(status: unknown): boolean {
  return status === 'cancelled' || status === 'cancelled_early' || status === 'cancelled_late';
}

export function buildTripCancelledParams(
  payload: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const reason = String(payload?.cancel_reason ?? 'user_cancel');
  return {
    cancel_reason: reason,
    cancel_actor: String(payload?.cancel_actor ?? ''),
    counts_for_tvf: String(payload?.counts_for_tvf ?? false),
    credit_driver: String(payload?.credit_driver ?? false),
    fee_applied: String(payload?.fee_applied ?? 0),
    ...(payload?.id ? { trip_id: String(payload.id) } : {}),
  };
}

/**
 * When GET /trips/active returns null, inspect trip detail (GET /trips/:id).
 * Cancelled → show TripCancelled; otherwise silent dismiss (expired / rematch).
 */
export function resolveActiveGoneAction(
  detail: Record<string, unknown> | null | undefined,
): { action: 'trip_cancelled'; params: Record<string, string> } | { action: 'dismiss' } {
  if (detail && isCancelledTripStatus(detail.status)) {
    return { action: 'trip_cancelled', params: buildTripCancelledParams(detail) };
  }
  return { action: 'dismiss' };
}

/** Shared across IncomingRequest + DriverRealtimeProvider — one TripCancelled nav per trip. */
let claimedCancelTripId: string | null = null;

export function claimTripCancelNotice(tripId: string | null | undefined): boolean {
  if (tripId == null || tripId === '') return true;
  if (claimedCancelTripId === tripId) return false;
  claimedCancelTripId = tripId;
  return true;
}

export function resetTripCancelNoticeClaim(tripId?: string | null): void {
  if (tripId == null || claimedCancelTripId === tripId) {
    claimedCancelTripId = null;
  }
}
