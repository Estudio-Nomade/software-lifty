/**
 * Professional carnet grace for auto drivers.
 * PRODUCT LOCK (2026-10-24): clock starts on first successful is_online=true, not approve.
 * v1: banner + admin visibility only — does NOT hard-block online on day 61.
 */

export const PROFESSIONAL_LICENSE_GRACE_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LicenseProfessionalStatus =
  | 'unknown'
  | 'professional'
  | 'pending_professional'
  | 'not_required'
  | string;

export type ProfessionalLicensePhase =
  | 'not_applicable'
  | 'not_started'
  | 'grace'
  | 'overdue'
  | 'satisfied';

export type ProfessionalLicenseGraceSnapshot = {
  license_category: string | null;
  license_professional_status: LicenseProfessionalStatus;
  phase: ProfessionalLicensePhase;
  /** v1 always false — hard-block is a follow-up. */
  blocks_online: boolean;
  show_banner: boolean;
  grace_days: number;
  grace_started_at: string | null;
  due_at: string | null;
  days_remaining: number | null;
  days_elapsed: number | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** True when first online should stamp the grace clock (one-shot). */
export function shouldStartProfessionalLicenseGrace(input: {
  isGoingOnline: boolean;
  license_professional_status: LicenseProfessionalStatus | null | undefined;
  professional_license_grace_started_at?: Date | string | null;
}): boolean {
  if (!input.isGoingOnline) return false;
  if (input.license_professional_status !== 'pending_professional') return false;
  return toDate(input.professional_license_grace_started_at) == null;
}

/**
 * Clear grace timestamps only on explicit exit from pending_professional.
 * Re-saves that re-resolve the same status must not wipe a running clock.
 */
export function shouldClearProfessionalGraceTimestamps(
  prev: LicenseProfessionalStatus | null | undefined,
  next: LicenseProfessionalStatus | null | undefined,
): boolean {
  if (prev !== 'pending_professional') return false;
  return next === 'professional' || next === 'not_required';
}

export function buildGraceStartPatch(now: Date = new Date()): {
  professional_license_grace_started_at: Date;
  professional_license_due_at: Date;
} {
  return {
    professional_license_grace_started_at: now,
    professional_license_due_at: addDays(now, PROFESSIONAL_LICENSE_GRACE_DAYS),
  };
}

export function evaluateProfessionalLicenseGrace(input: {
  license_category?: string | null;
  license_professional_status?: LicenseProfessionalStatus | null;
  professional_license_grace_started_at?: Date | string | null;
  professional_license_due_at?: Date | string | null;
  now?: Date;
}): ProfessionalLicenseGraceSnapshot {
  const status = (input.license_professional_status ?? 'unknown') as LicenseProfessionalStatus;
  const category = input.license_category ?? null;
  const now = input.now ?? new Date();
  const started = toDate(input.professional_license_grace_started_at);
  const due =
    toDate(input.professional_license_due_at) ??
    (started ? addDays(started, PROFESSIONAL_LICENSE_GRACE_DAYS) : null);

  const base = {
    license_category: category,
    license_professional_status: status,
    grace_days: PROFESSIONAL_LICENSE_GRACE_DAYS,
    blocks_online: false as const,
  };

  if (status === 'professional') {
    return {
      ...base,
      phase: 'satisfied',
      show_banner: false,
      grace_started_at: started?.toISOString() ?? null,
      due_at: due?.toISOString() ?? null,
      days_remaining: null,
      days_elapsed: null,
    };
  }

  if (status === 'not_required') {
    return {
      ...base,
      phase: 'not_applicable',
      show_banner: false,
      grace_started_at: null,
      due_at: null,
      days_remaining: null,
      days_elapsed: null,
    };
  }

  if (status !== 'pending_professional') {
    return {
      ...base,
      phase: 'not_applicable',
      show_banner: false,
      grace_started_at: started?.toISOString() ?? null,
      due_at: due?.toISOString() ?? null,
      days_remaining: null,
      days_elapsed: null,
    };
  }

  // pending_professional
  if (!started || !due) {
    return {
      ...base,
      phase: 'not_started',
      show_banner: true,
      grace_started_at: null,
      due_at: null,
      days_remaining: PROFESSIONAL_LICENSE_GRACE_DAYS,
      days_elapsed: null,
    };
  }

  const elapsed = daysBetween(started, now);
  const remaining = Math.max(0, PROFESSIONAL_LICENSE_GRACE_DAYS - elapsed);
  const overdue = now.getTime() >= due.getTime();

  return {
    ...base,
    phase: overdue ? 'overdue' : 'grace',
    show_banner: true,
    grace_started_at: started.toISOString(),
    due_at: due.toISOString(),
    days_remaining: overdue ? 0 : remaining,
    days_elapsed: elapsed,
  };
}

/** Moto license classes — see moto-license-category.ts (ANSV A1.x). Re-export keepers. */
export {
  MOTO_LICENSE_CATEGORIES,
  type MotoLicenseCategory,
  isAllowedMotoLicenseCategory,
  normalizeMotoLicenseCategory as normalizeLicenseCategory,
} from './moto-license-category';

/** Map UI/API category + vehicle type → professional status. */
export function resolveLicenseProfessionalStatus(input: {
  vehicle_type?: string | null;
  license_category?: string | null;
  explicit_status?: LicenseProfessionalStatus | null;
}): LicenseProfessionalStatus {
  if (input.explicit_status) return input.explicit_status;

  const cat = (input.license_category ?? '').trim().toLowerCase();
  const vt = (input.vehicle_type ?? '').trim().toLowerCase();
  const isMoto = vt === 'motorcycle' || vt === 'moto';

  if (!cat) return 'unknown';

  // Without vehicle type, do not assume auto (A1.x would falsely become pending).
  if (!vt) return 'unknown';

  if (isMoto) {
    // A1.2/A1.3/A1.4 (and legacy A2/A3/A4 aliases) — no professional-car grace.
    // Invalid classes still do not start auto professional grace (rejected at service).
    return 'not_required';
  }

  // Auto
  if (cat === 'professional' || cat === 'profesional' || cat === 'pro') return 'professional';
  if (cat === 'pending_professional' || cat === 'pending') return 'pending_professional';
  // Common private classes → grace path
  if (cat === 'b' || cat === 'b1' || cat === 'particular') return 'pending_professional';

  return 'pending_professional';
}
