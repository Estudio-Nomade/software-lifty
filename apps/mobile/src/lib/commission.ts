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
): platformDebt is number {
  if (opts?.debtBlocksOnline) return true;
  const debt = Number(platformDebt ?? 0);
  if (debt > 0) return true;
  return false;
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
