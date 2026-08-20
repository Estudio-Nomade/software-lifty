/**
 * Regla de negocio — Fase 1 (primer mes de operación).
 *
 * Durante la Fase 1 la comisión es 0% y no se genera deuda con la plataforma,
 * por lo que la sección "Deuda pendiente" no debe mostrarse.
 *
 * Al pasar a la Fase 2 (comisión activa) cambiar este flag a `false` para que la
 * deuda pendiente vuelva a renderizarse automáticamente (ver `shouldShowPlatformDebt`).
 *
 * Se tipa explícitamente como `boolean` (y no como literal `true`) a propósito:
 * evita que el linter marque la condición como constante y mantiene el flag
 * fácil de cambiar.
 */
export const isPhaseOne: boolean = true;

/**
 * Decide si mostrar la sección "Deuda pendiente".
 *
 * - Fase 1 → siempre `false` (no hay deuda, comisión 0%).
 * - Fase 2+ → `true` únicamente si existe deuda pendiente (`platformDebt > 0`).
 *
 * Centraliza la regla para reutilizarla en cualquier pantalla (Earnings, Online,
 * etc.) sin duplicar la lógica de fase.
 */
export function shouldShowPlatformDebt(platformDebt: number | undefined): platformDebt is number {
  if (isPhaseOne) return false;
  return Boolean(platformDebt);
}
