import { ApiError } from '../api/types';

export type AcceptFailureKind =
  | 'session'
  | 'expired'
  | 'unavailable'
  | 'vehicle_mismatch'
  | 'retryable'
  | 'unknown';

export type AcceptFailureNavigate = 'Active' | 'Welcome' | 'TripCancelled' | null;

export type AcceptFailure = {
  kind: AcceptFailureKind;
  title: string;
  body: string;
  /** true → no ringtone, clear offer, leave screen after CTA */
  terminalOffer: boolean;
  navigate: AcceptFailureNavigate;
};

export type MapAcceptFailureOptions = {
  /** Offer status still request_received / offered on client */
  offerStillAlive?: boolean;
};

const SESSION: AcceptFailure = {
  kind: 'session',
  title: 'Sesión expirada',
  body: 'Tu sesión expiró. Volvé a iniciar sesión.',
  terminalOffer: true,
  navigate: 'Welcome',
};

const EXPIRED: AcceptFailure = {
  kind: 'expired',
  title: 'La solicitud expiró',
  body: 'Ya no podés aceptar este viaje.',
  terminalOffer: true,
  navigate: 'Active',
};

const UNAVAILABLE: AcceptFailure = {
  kind: 'unavailable',
  title: 'Este viaje ya no está disponible',
  body: 'La solicitud se reasignó o ya no está abierta.',
  terminalOffer: true,
  navigate: 'Active',
};

const VEHICLE: AcceptFailure = {
  kind: 'vehicle_mismatch',
  title: 'Vehículo no coincide',
  body: 'Este viaje pide otro tipo de vehículo.',
  terminalOffer: true,
  navigate: 'Active',
};

const RETRYABLE: AcceptFailure = {
  kind: 'retryable',
  title: 'No se pudo aceptar',
  body: 'Revisá la conexión e intentá de nuevo.',
  terminalOffer: false,
  navigate: null,
};

const UNKNOWN_ALIVE: AcceptFailure = {
  kind: 'unknown',
  title: 'No se pudo aceptar',
  body: 'Intentá de nuevo en un momento.',
  terminalOffer: false,
  navigate: null,
};

const UNKNOWN_DEAD: AcceptFailure = {
  kind: 'unknown',
  title: 'No se pudo aceptar',
  body: 'Intentá de nuevo en un momento.',
  terminalOffer: true,
  navigate: 'Active',
};

function readCode(err: unknown): string | null {
  if (err instanceof ApiError) return err.code;
  if (err && typeof err === 'object') {
    const anyErr = err as { code?: unknown; error?: { code?: unknown } };
    if (typeof anyErr.code === 'string') return anyErr.code;
    if (typeof anyErr.error?.code === 'string') return anyErr.error.code;
  }
  return null;
}

function readMessage(err: unknown): string {
  if (err instanceof Error) return err.message ?? '';
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

function readStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status;
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

function looksExpired(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('expir') || m.includes('offer expired');
}

function looksUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('invalid transition') ||
    m.includes('already claimed') ||
    m.includes('not found') ||
    m.includes('no longer') ||
    m.includes('ya no')
  );
}

function isNetworkish(code: string | null, status: number | null, message: string): boolean {
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'ERR_NETWORK') return true;
  if (status != null && status >= 500) return true;
  if (status === 0) return true;
  const m = message.toLowerCase();
  return m.includes('network') || m.includes('timeout') || m.includes('econn');
}

export function mapAcceptFailure(
  err: unknown,
  options: MapAcceptFailureOptions = {},
): AcceptFailure {
  const offerStillAlive = options.offerStillAlive !== false;
  const code = readCode(err);
  const message = readMessage(err);
  const status = readStatus(err);

  if (
    code === 'TOKEN_REQUIRED' ||
    code === 'TOKEN_EXPIRED' ||
    (status === 401 && (code === 'UNAUTHORIZED' || !code))
  ) {
    return SESSION;
  }

  if (code === 'OFFER_EXPIRED' || looksExpired(message)) {
    return EXPIRED;
  }

  if (code === 'VEHICLE_TYPE_MISMATCH') {
    return VEHICLE;
  }

  if (code === 'CONFLICT' || status === 409 || looksUnavailable(message)) {
    return UNAVAILABLE;
  }

  if (isNetworkish(code, status, message)) {
    if (offerStillAlive) return RETRYABLE;
    return { ...RETRYABLE, terminalOffer: true, navigate: 'Active' };
  }

  if (code === 'BAD_REQUEST' && looksUnavailable(message)) {
    return UNAVAILABLE;
  }

  if (!offerStillAlive) return UNKNOWN_DEAD;
  return UNKNOWN_ALIVE;
}

mapAcceptFailure.pollGone = (): AcceptFailure => UNAVAILABLE;
