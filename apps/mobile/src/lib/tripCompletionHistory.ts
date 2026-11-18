import { completeExceptionReasonLabel, isCompleteExceptionReason } from './completeException';

/** Shared history copy — keep parity with mobile-passengers. */
export const COMPLETION_SECTION_TITLE = 'Finalización del viaje';
export const COMPLETION_BADGE_NORMAL = 'En destino';
export const COMPLETION_BADGE_EXCEPTION = 'Excepción';

export type CompletionHistoryFields = {
  status: string;
  completion_type?: string | null;
  completed_at?: string | null;
  completed_distance_m?: number | null;
  completion_exception_reason?: string | null;
  completion_exception_note?: string | null;
};

export type CompletionHistoryView = {
  title: string;
  badge: { label: string; kind: 'normal' | 'exception' } | null;
  reasonLine: string | null;
  noteLine: string | null;
  distanceLine: string | null;
};

/** Legacy trips without pack A columns → hide section (null-safe). */
export function shouldShowCompletionSection(trip: CompletionHistoryFields): boolean {
  if (trip.status !== 'completed' && trip.status !== 'rated') return false;
  return (
    trip.completion_type != null || trip.completed_at != null || trip.completed_distance_m != null
  );
}

export function formatCompletedDistanceLine(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  return `${Math.round(meters)} m del pin`;
}

export function completionExceptionReasonLine(reason: string | null | undefined): string | null {
  if (reason == null || reason === '') return null;
  if (isCompleteExceptionReason(reason)) return completeExceptionReasonLabel(reason);
  return reason;
}

export function buildCompletionHistoryView(
  trip: CompletionHistoryFields,
): CompletionHistoryView | null {
  if (!shouldShowCompletionSection(trip)) return null;

  let badge: CompletionHistoryView['badge'] = null;
  if (trip.completion_type === 'exception') {
    badge = { label: COMPLETION_BADGE_EXCEPTION, kind: 'exception' };
  } else if (trip.completion_type === 'normal') {
    badge = { label: COMPLETION_BADGE_NORMAL, kind: 'normal' };
  }

  const reasonLine =
    trip.completion_type === 'exception'
      ? completionExceptionReasonLine(trip.completion_exception_reason)
      : null;

  const noteRaw = trip.completion_exception_note?.trim() ?? '';
  const noteLine = trip.completion_type === 'exception' && noteRaw.length > 0 ? noteRaw : null;

  return {
    title: COMPLETION_SECTION_TITLE,
    badge,
    reasonLine,
    noteLine,
    distanceLine: formatCompletedDistanceLine(trip.completed_distance_m),
  };
}
