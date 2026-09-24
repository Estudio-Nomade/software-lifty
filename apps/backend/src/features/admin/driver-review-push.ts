/** Shared push copy for panel review + one-click mail approve (no DB deps). */

export const DRIVER_APPROVED_PUSH = {
  title: '¡Fuiste aprobado!',
  body: 'Ya podés usar Lifty. Retirá los stickers en tránsito (tenés 30 días).',
  data: { type: 'driver:approved' } as Record<string, string>,
  channelId: 'account',
} as const;

const REJECT_PUSH_FALLBACK = 'Entrá a la app, revisá el motivo y volvé a subir lo que falte.';

/** Sanitize + truncate admin notes for push body / data.reason (~120 chars). */
export function shortReviewReason(notes?: string | null): string {
  if (!notes) return REJECT_PUSH_FALLBACK;
  const plain = notes
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return REJECT_PUSH_FALLBACK;
  if (plain.length <= 120) return plain;
  return `${plain.slice(0, 117)}...`;
}

export function driverRejectedPush(notes?: string | null) {
  const reason = shortReviewReason(notes);
  return {
    title: 'No pudimos aprobar tus documentos',
    body: reason,
    data: { type: 'driver:rejected', reason } as Record<string, string>,
    channelId: 'account' as const,
  };
}
