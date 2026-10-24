export type PlatformDebtVisibilityOpts = {
  debtBlocksOnline?: boolean;
  /** When backend says commission rate phase is 0 and debt is 0, OK to hide */
  commissionActive?: boolean;
};

/**
 * Show platform debt UI when backend reports debt or hard-block.
 * Never hardcode “phase one hide forever” — rate engine is server SoT.
 */
export function shouldShowPlatformDebt(
  platformDebt: number | undefined,
  opts?: PlatformDebtVisibilityOpts,
): boolean {
  if (opts?.debtBlocksOnline) return true;
  return normalizePlatformDebt(platformDebt) > 0;
}

/** Safe amount for display when debt may be missing under a hard-block flag. */
export function normalizePlatformDebt(platformDebt: number | undefined): number {
  const n = Number(platformDebt ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** @deprecated obsolete phase-one hide; do not use — server SoT for commission rate */
export const isPhaseOne: boolean = false;

export function formatDebtCapLabel(capArs: number | undefined): string | null {
  if (capArs == null || !Number.isFinite(capArs) || capArs <= 0) return null;
  return `tope $${capArs.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** API statuses for driver → Lifty commission receipts (schema + admin pack). */
export type CommissionReceiptStatus = 'pending_review' | 'approved' | 'rejected_fraud' | string;

export function formatCommissionReceiptStatus(status: CommissionReceiptStatus): string {
  switch (status) {
    case 'pending_review':
      return 'En revisión';
    case 'approved':
      return 'Aprobado';
    case 'rejected_fraud':
      return 'Rechazado';
    default:
      return 'Desconocido';
  }
}

export function formatCommissionReceiptDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

/** Only allow http(s) receipt file URLs from API before Linking.openURL. */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
