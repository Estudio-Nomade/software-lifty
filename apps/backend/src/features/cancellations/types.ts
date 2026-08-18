export type CancelActor = 'passenger' | 'driver' | 'system';
export type CancelReason = 'user_cancel' | 'auto_timeout' | 'no_show' | 'driver_cancel';
export type CancelStage = 'pre_asignacion' | 'en_camino' | 'llegado';
export type CancelErrorCode =
  | 'CANCEL_NOT_ALLOWED'
  | 'NO_SHOW_TOO_EARLY'
  | 'FEE_ALREADY_APPLIED'
  | 'DEBT_BLOCKED'
  | 'PASSENGER_SUSPENDED'
  | 'PASSENGER_UNDER_REVIEW'
  | 'GPS_ACCURACY';

export interface CancellationConfig {
  graceS: number;
  waitS: number;
  searchTimeoutS: number;
  feeArs: number;
  arrivalRadiusM: number;
  gpsAccuracyMaxM: number;
  debtWarnArs: number;
  debtBlockArs: number;
  collectionPhase: 1 | 2;
  passengerWindowDays: number;
  passengerMinTrips: number;
  passengerWarnBp: number;
  passengerSuspendBp: number;
  passengerReviewBp: number;
  suspendHours: number;
  visibilityMinCancels: number;
  tvfWindowDays: number;
  tvfWarnBp: number;
  tvfBlockBp: number;
  tickMs: number;
}

export interface EvaluateCancelInput {
  status: string;
  actor: CancelActor;
  reason: CancelReason;
  now: Date;
  createdAt: Date;
  assignedAt: Date | null;
  waitingSince: Date | null;
  config: CancellationConfig;
}

export interface CancelDecision {
  canCancel: boolean;
  feeArs: number;
  creditDriver: boolean;
  countsForTvf: boolean;
  reason: CancelReason;
  stage: CancelStage;
  code?: CancelErrorCode;
  copyKey?: 'free' | 'fee_phase1' | 'fee_phase2';
}
