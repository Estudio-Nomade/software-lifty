import type { CancellationConfig } from './types';

export const DEFAULT_CANCELLATION_CONFIG: CancellationConfig = {
  graceS: 120,
  waitS: 300,
  searchTimeoutS: 300,
  feeArs: 600,
  arrivalRadiusM: 50,
  gpsAccuracyMaxM: 50,
  debtWarnArs: 2500,
  debtBlockArs: 3000,
  collectionPhase: 1,
  passengerWindowDays: 30,
  passengerMinTrips: 5,
  passengerWarnBp: 3000,
  passengerSuspendBp: 4000,
  passengerReviewBp: 5000,
  suspendHours: 72,
  visibilityMinCancels: 5,
  tvfWindowDays: 30,
  // Completion-rate bp: warn when completion < 30% (cancel ≥ 70%), block when < 5% (cancel ≥ 95%).
  tvfWarnBp: 3000,
  tvfBlockBp: 500,
  tickMs: 5000,
};

const KEY_MAP: Record<string, keyof CancellationConfig> = {
  'cancel.grace_s': 'graceS',
  'cancel.wait_s': 'waitS',
  'cancel.search_timeout_s': 'searchTimeoutS',
  'cancel.fee_ars': 'feeArs',
  'cancel.arrival_radius_m': 'arrivalRadiusM',
  'cancel.gps_accuracy_max_m': 'gpsAccuracyMaxM',
  'cancel.debt_warn_ars': 'debtWarnArs',
  'cancel.debt_block_ars': 'debtBlockArs',
  'cancel.collection_phase': 'collectionPhase',
  'cancel.passenger_window_days': 'passengerWindowDays',
  'cancel.passenger_min_trips': 'passengerMinTrips',
  'cancel.passenger_warn_bp': 'passengerWarnBp',
  'cancel.passenger_suspend_bp': 'passengerSuspendBp',
  'cancel.passenger_review_bp': 'passengerReviewBp',
  'cancel.suspend_hours': 'suspendHours',
  'cancel.visibility_min_cancels': 'visibilityMinCancels',
  'cancel.tvf_window_days': 'tvfWindowDays',
  'cancel.tvf_warn_bp': 'tvfWarnBp',
  'cancel.tvf_block_bp': 'tvfBlockBp',
  'cancel.tick_ms': 'tickMs',
};

export function parseCancellationConfig(
  rows: { key: string; value: string }[],
): CancellationConfig {
  const config = { ...DEFAULT_CANCELLATION_CONFIG };
  for (const row of rows) {
    const field = KEY_MAP[row.key];
    if (!field) continue;
    const parsed = Number.parseInt(row.value, 10);
    if (Number.isNaN(parsed)) continue;
    if (field === 'collectionPhase') {
      config.collectionPhase = parsed === 2 ? 2 : 1;
    } else {
      (config[field] as number) = parsed;
    }
  }
  return config;
}
