/** Sticker / municipal identification pickup windows after platform approval. */
/** Soft/stronger banner in the last stretch before suspend (still online). */
export const IDENTIFICATION_REMINDER_DAYS = 20;
/** Without transit pickup by this day → account suspended (no online). */
export const IDENTIFICATION_PAUSE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type IdentificationStatus = 'pending_pickup' | 'issued' | 'revoked' | string;

export type IdentificationPhase =
  | 'issued'
  | 'revoked'
  | 'grace'
  | 'reminder'
  | 'paused'
  | 'unknown';

export type IdentificationDeadlineSnapshot = {
  identification_status: IdentificationStatus;
  phase: IdentificationPhase;
  /** True when stickers block going online (revoked or past pause window). */
  blocks_online: boolean;
  /** Soft reminder after 30d; still online-capable until pause. */
  show_reminder: boolean;
  days_since_approval: number | null;
  reminder_days: number;
  pause_days: number;
  approval_anchor_at: string | null;
  reminder_at: string | null;
  pause_at: string | null;
  days_until_pause: number | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Anchor for the pickup clock: platform approval moment. */
export function resolveApprovalAnchor(input: {
  approved_at?: Date | string | null;
  admin_reviewed_at?: Date | string | null;
  created_at?: Date | string | null;
}): Date | null {
  return (
    toDate(input.approved_at) ?? toDate(input.admin_reviewed_at) ?? toDate(input.created_at) ?? null
  );
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Evaluate identification pickup windows.
 * - issued → full OK
 * - revoked → hard block
 * - pending_pickup < reminder days → grace (online OK, soft banner)
 * - pending_pickup reminder–(pause-1) → reminder (online OK, stronger banner)
 * - pending_pickup ≥ 30d → paused/suspended (online blocked until transit issues)
 */
export function evaluateIdentificationDeadline(input: {
  identification_status: IdentificationStatus | null | undefined;
  approved_at?: Date | string | null;
  admin_reviewed_at?: Date | string | null;
  created_at?: Date | string | null;
  now?: Date;
}): IdentificationDeadlineSnapshot {
  const status = (input.identification_status ?? 'pending_pickup') as IdentificationStatus;
  const now = input.now ?? new Date();
  const base = {
    identification_status: status,
    reminder_days: IDENTIFICATION_REMINDER_DAYS,
    pause_days: IDENTIFICATION_PAUSE_DAYS,
  };

  if (status === 'issued') {
    return {
      ...base,
      phase: 'issued',
      blocks_online: false,
      show_reminder: false,
      days_since_approval: null,
      approval_anchor_at: null,
      reminder_at: null,
      pause_at: null,
      days_until_pause: null,
    };
  }

  if (status === 'revoked') {
    return {
      ...base,
      phase: 'revoked',
      blocks_online: true,
      show_reminder: false,
      days_since_approval: null,
      approval_anchor_at: null,
      reminder_at: null,
      pause_at: null,
      days_until_pause: null,
    };
  }

  const anchor = resolveApprovalAnchor(input);
  if (!anchor) {
    // No approval clock yet — treat as grace so brand-new rows are not locked.
    return {
      ...base,
      phase: status === 'pending_pickup' ? 'grace' : 'unknown',
      blocks_online: false,
      show_reminder: false,
      days_since_approval: null,
      approval_anchor_at: null,
      reminder_at: null,
      pause_at: null,
      days_until_pause: null,
    };
  }

  const elapsed = daysBetween(anchor, now);
  const reminderAt = addDays(anchor, IDENTIFICATION_REMINDER_DAYS);
  const pauseAt = addDays(anchor, IDENTIFICATION_PAUSE_DAYS);
  const daysUntilPause = Math.max(0, IDENTIFICATION_PAUSE_DAYS - elapsed);

  if (elapsed >= IDENTIFICATION_PAUSE_DAYS) {
    return {
      ...base,
      phase: 'paused',
      blocks_online: true,
      show_reminder: true,
      days_since_approval: elapsed,
      approval_anchor_at: anchor.toISOString(),
      reminder_at: reminderAt.toISOString(),
      pause_at: pauseAt.toISOString(),
      days_until_pause: 0,
    };
  }

  if (elapsed >= IDENTIFICATION_REMINDER_DAYS) {
    return {
      ...base,
      phase: 'reminder',
      blocks_online: false,
      show_reminder: true,
      days_since_approval: elapsed,
      approval_anchor_at: anchor.toISOString(),
      reminder_at: reminderAt.toISOString(),
      pause_at: pauseAt.toISOString(),
      days_until_pause: daysUntilPause,
    };
  }

  return {
    ...base,
    phase: 'grace',
    blocks_online: false,
    show_reminder: true,
    days_since_approval: elapsed,
    approval_anchor_at: anchor.toISOString(),
    reminder_at: reminderAt.toISOString(),
    pause_at: pauseAt.toISOString(),
    days_until_pause: daysUntilPause,
  };
}

export function identificationBlocksOnline(
  identification_status: IdentificationStatus | null | undefined,
  anchors: {
    approved_at?: Date | string | null;
    admin_reviewed_at?: Date | string | null;
    created_at?: Date | string | null;
  },
  now?: Date,
): boolean {
  return evaluateIdentificationDeadline({
    identification_status,
    ...anchors,
    now,
  }).blocks_online;
}
