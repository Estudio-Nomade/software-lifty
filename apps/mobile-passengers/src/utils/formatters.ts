export function formatCurrency(value: number | null | undefined): string {
  return value == null ? '—' : `$${value.toLocaleString('es-AR')}`;
}
