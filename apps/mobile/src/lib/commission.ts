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
