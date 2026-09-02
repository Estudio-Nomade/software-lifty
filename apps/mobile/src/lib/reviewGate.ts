export type ReviewGateResult = { ok: true } | { ok: false; message: string };

/**
 * Whether the driver may enter WaitingApproval after finishing the docs UI.
 * Only `step === 'review'` means the backend has the full required set and
 * (when status was not already approved) notified admins.
 */
export function resolveReviewGate(step: string | undefined): ReviewGateResult {
  if (step === 'review') return { ok: true };
  if (step === 'documents') {
    return {
      ok: false,
      message: 'Faltan documentos por subir. Revisa que todos esten completos.',
    };
  }
  return {
    ok: false,
    message: 'Todavia no podemos enviar tus documentos. Reintenta en unos segundos.',
  };
}
