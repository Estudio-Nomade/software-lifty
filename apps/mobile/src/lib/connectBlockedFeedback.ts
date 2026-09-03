import { ApiError } from '../api/types';
import type { SnackbarTone } from '../components/feedback/Snackbar';

export type ConnectBlockedFeedback = {
  title: string;
  message: string;
  tone: SnackbarTone;
};

const BY_CODE: Record<string, ConnectBlockedFeedback> = {
  DRIVER_NOT_APPROVED: {
    title: 'Aún no podés conectarte',
    message: 'Tu cuenta está en revisión. Te avisamos cuando esté aprobada.',
    tone: 'warning',
  },
  DOCS_PENDING_REVIEW: {
    title: 'Documentos en revisión',
    message: 'No podés conectarte hasta que aprueben tus papeles.',
    tone: 'warning',
  },
  LOCATION_REQUIRED: {
    title: 'Falta tu ubicación',
    message: 'Activá el GPS o concedé permiso de ubicación para conectarte.',
    tone: 'warning',
  },
};

export function feedbackForConnectBlock(
  reason: 'not_approved' | 'docs_pending' | 'no_location',
): ConnectBlockedFeedback {
  if (reason === 'not_approved') return BY_CODE.DRIVER_NOT_APPROVED;
  if (reason === 'docs_pending') return BY_CODE.DOCS_PENDING_REVIEW;
  return BY_CODE.LOCATION_REQUIRED;
}

export function feedbackFromConnectError(err: unknown): ConnectBlockedFeedback {
  if (err instanceof ApiError) {
    const mapped = BY_CODE[err.code];
    if (mapped) return mapped;
    if (err.status === 403 || err.status === 409) {
      return {
        title: 'No podés conectarte',
        message: polishConnectMessage(err.message),
        tone: 'warning',
      };
    }
    return {
      title: 'No se pudo conectar',
      message: polishConnectMessage(err.message),
      tone: 'error',
    };
  }

  if (err instanceof Error && err.message) {
    return {
      title: 'No se pudo conectar',
      message: polishConnectMessage(err.message),
      tone: 'error',
    };
  }

  return {
    title: 'No se pudo conectar',
    message: 'Reintentá en unos segundos.',
    tone: 'error',
  };
}

function polishConnectMessage(raw: string): string {
  const trimmed = raw.trim();
  if (/todavia no estas aprobado/i.test(trimmed)) {
    return 'Tu cuenta está en revisión. Te avisamos cuando esté aprobada.';
  }
  return trimmed
    .replace(/\bTenes\b/g, 'Tenés')
    .replace(/\bpodes\b/gi, 'podés')
    .replace(/\bubicacion\b/gi, 'ubicación')
    .replace(/\brevision\b/gi, 'revisión');
}
