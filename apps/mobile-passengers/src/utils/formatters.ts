export function formatCurrency(value: number | null | undefined): string {
  return value == null ? '—' : `$${value.toLocaleString('es-AR')}`;
}

/** km with es-AR decimal (e.g. 4,2 km). */
export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  const rounded = km < 100 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`;
}

export function formatDurationMin(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  return `${Math.round(min)} min`;
}
