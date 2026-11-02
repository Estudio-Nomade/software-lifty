export type RideRequestErrorCode =
  | 'PASSENGER_SUSPENDED'
  | 'PASSENGER_UNDER_REVIEW'
  | 'DEBT_BLOCKED'
  | 'OUT_OF_PICKUP_AREA'
  | 'OUT_OF_DROPOFF_AREA'
  | 'UNKNOWN';

export type RideRequestErrorInfo = {
  code: RideRequestErrorCode;
  title: string;
  message: string;
  showSupport: boolean;
  showHistory: boolean;
};

export type FareEstimateErrorInfo = {
  code: RideRequestErrorCode | 'API_UNREACHABLE' | 'FARE_FAILED';
  title: string;
  message: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function extractApiError(err: unknown): { code: string; message: string; status: number } {
  const ax = asRecord(err);
  const response = ax ? asRecord(ax.response) : null;
  const data = response ? asRecord(response.data) : null;
  const errorObj = data ? asRecord(data.error) : null;
  const status = typeof response?.status === 'number' ? response.status : 0;

  const code =
    (typeof errorObj?.code === 'string' && errorObj.code) ||
    (typeof data?.code === 'string' && data.code) ||
    '';
  const message =
    (typeof errorObj?.message === 'string' && errorObj.message) ||
    (typeof data?.message === 'string' && data.message) ||
    (err instanceof Error ? err.message : '') ||
    '';

  return { code, message, status };
}

function resolveCode(codeRaw: string, messageRaw: string): RideRequestErrorCode {
  if (
    codeRaw === 'PASSENGER_SUSPENDED' ||
    codeRaw === 'PASSENGER_UNDER_REVIEW' ||
    codeRaw === 'DEBT_BLOCKED' ||
    codeRaw === 'OUT_OF_PICKUP_AREA' ||
    codeRaw === 'OUT_OF_DROPOFF_AREA'
  ) {
    return codeRaw;
  }
  const lower = messageRaw.toLowerCase();
  if (lower.includes('suspend')) return 'PASSENGER_SUSPENDED';
  if (lower.includes('deuda')) return 'DEBT_BLOCKED';
  if (lower.includes('revisión') || lower.includes('revision')) return 'PASSENGER_UNDER_REVIEW';
  if (lower.includes('no pedimos viajes') || lower.includes('núcleo de pickup')) {
    return 'OUT_OF_PICKUP_AREA';
  }
  if (lower.includes('destino fuera del alcance')) return 'OUT_OF_DROPOFF_AREA';
  return 'UNKNOWN';
}

/** Extract API error shape from axios / thrown Error (ride request). */
export function parseRideRequestError(err: unknown): RideRequestErrorInfo {
  const { code: codeRaw, message: messageRaw } = extractApiError(err);
  const fallback = 'No se pudo solicitar el viaje. Intentá de nuevo.';
  const message = messageRaw || fallback;
  const code = resolveCode(codeRaw, message);

  if (code === 'PASSENGER_SUSPENDED') {
    return {
      code,
      title: 'Cuenta suspendida temporalmente',
      message,
      showSupport: true,
      showHistory: true,
    };
  }
  if (code === 'PASSENGER_UNDER_REVIEW') {
    return {
      code,
      title: 'Cuenta en revisión',
      message,
      showSupport: true,
      showHistory: true,
    };
  }
  if (code === 'DEBT_BLOCKED') {
    return {
      code,
      title: 'Deuda pendiente',
      message,
      showSupport: true,
      showHistory: true,
    };
  }
  if (code === 'OUT_OF_PICKUP_AREA') {
    return {
      code,
      title: 'Fuera de zona de pickup',
      message,
      showSupport: false,
      showHistory: false,
    };
  }
  if (code === 'OUT_OF_DROPOFF_AREA') {
    return {
      code,
      title: 'Destino fuera de zona',
      message,
      showSupport: false,
      showHistory: false,
    };
  }

  return {
    code: 'UNKNOWN',
    title: 'No se pudo solicitar el viaje',
    message,
    showSupport: false,
    showHistory: false,
  };
}

/**
 * Fare-estimate failures: prefer BE service-area message over generic tarifa copy.
 * Caller should still check isApiUnreachable for host-down first.
 */
export function parseFareEstimateError(err: unknown): FareEstimateErrorInfo {
  const { code: codeRaw, message: messageRaw, status } = extractApiError(err);
  const code = resolveCode(codeRaw, messageRaw);

  if (code === 'OUT_OF_PICKUP_AREA') {
    return {
      code,
      title: 'Fuera de zona de pickup',
      message:
        messageRaw ||
        'No pedimos viajes desde esa zona. El origen debe estar cerca de una ciudad Lifty activa.',
    };
  }
  if (code === 'OUT_OF_DROPOFF_AREA') {
    return {
      code,
      title: 'Destino fuera de zona',
      message: messageRaw || 'Destino fuera del alcance Lifty para esta ciudad.',
    };
  }

  if (status >= 500) {
    return {
      code: 'FARE_FAILED',
      title: 'No pudimos calcular la tarifa',
      message: 'Reintentá más tarde.',
    };
  }

  return {
    code: 'FARE_FAILED',
    title: 'No pudimos calcular la tarifa',
    message: messageRaw || 'Reintentá más tarde.',
  };
}
