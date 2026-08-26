export type RideRequestErrorCode =
  | 'PASSENGER_SUSPENDED'
  | 'PASSENGER_UNDER_REVIEW'
  | 'DEBT_BLOCKED'
  | 'UNKNOWN';

export type RideRequestErrorInfo = {
  code: RideRequestErrorCode;
  title: string;
  message: string;
  showSupport: boolean;
  showHistory: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function resolveCode(codeRaw: string, messageRaw: string): RideRequestErrorCode {
  if (
    codeRaw === 'PASSENGER_SUSPENDED' ||
    codeRaw === 'PASSENGER_UNDER_REVIEW' ||
    codeRaw === 'DEBT_BLOCKED'
  ) {
    return codeRaw;
  }
  const lower = messageRaw.toLowerCase();
  if (lower.includes('suspend')) return 'PASSENGER_SUSPENDED';
  if (lower.includes('deuda')) return 'DEBT_BLOCKED';
  if (lower.includes('revisión') || lower.includes('revision')) return 'PASSENGER_UNDER_REVIEW';
  return 'UNKNOWN';
}

/** Extract API error shape from axios / thrown Error. */
export function parseRideRequestError(err: unknown): RideRequestErrorInfo {
  const ax = asRecord(err);
  const response = ax ? asRecord(ax.response) : null;
  const data = response ? asRecord(response.data) : null;
  const errorObj = data ? asRecord(data.error) : null;

  const codeRaw =
    (typeof errorObj?.code === 'string' && errorObj.code) ||
    (typeof data?.code === 'string' && data.code) ||
    '';
  const messageRaw =
    (typeof errorObj?.message === 'string' && errorObj.message) ||
    (typeof data?.message === 'string' && data.message) ||
    (err instanceof Error ? err.message : '') ||
    'No se pudo solicitar el viaje. Intentá de nuevo.';

  const code = resolveCode(codeRaw, messageRaw);

  if (code === 'PASSENGER_SUSPENDED') {
    return {
      code,
      title: 'Cuenta suspendida temporalmente',
      message: messageRaw,
      showSupport: true,
      showHistory: true,
    };
  }
  if (code === 'PASSENGER_UNDER_REVIEW') {
    return {
      code,
      title: 'Cuenta en revisión',
      message: messageRaw,
      showSupport: true,
      showHistory: true,
    };
  }
  if (code === 'DEBT_BLOCKED') {
    return {
      code,
      title: 'Deuda pendiente',
      message: messageRaw,
      showSupport: true,
      showHistory: true,
    };
  }

  return {
    code: 'UNKNOWN',
    title: 'No se pudo solicitar el viaje',
    message: messageRaw,
    showSupport: false,
    showHistory: false,
  };
}
