import type { CancelDecision, CancelStage, EvaluateCancelInput } from './types';

const PRE_ASSIGN = new Set(['pending', 'offered']);
const EN_CAMINO = new Set(['accepted', 'en_route']);
const TERMINAL = new Set([
  'in_trip',
  'completed',
  'rated',
  'cancelled',
  'cancelled_early',
  'cancelled_late',
  'rejected',
  'expired',
]);

function elapsedS(from: Date | null, now: Date): number | null {
  if (!from) return null;
  return (now.getTime() - from.getTime()) / 1000;
}

function deny(
  input: EvaluateCancelInput,
  stage: CancelStage,
  code: NonNullable<CancelDecision['code']>,
): CancelDecision {
  return {
    canCancel: false,
    feeArs: 0,
    creditDriver: false,
    countsForTvf: false,
    reason: input.reason,
    stage,
    code,
  };
}

function allow(
  input: EvaluateCancelInput,
  stage: CancelStage,
  feeArs: number,
  creditDriver: boolean,
  countsForTvf: boolean,
): CancelDecision {
  const copyKey =
    feeArs === 0 ? 'free' : input.config.collectionPhase === 2 ? 'fee_phase2' : 'fee_phase1';
  return {
    canCancel: true,
    feeArs,
    creditDriver,
    countsForTvf,
    reason: input.reason,
    stage,
    copyKey,
  };
}

function resolveBucket(input: EvaluateCancelInput): CancelStage | 'forbidden' {
  if (PRE_ASSIGN.has(input.status)) return 'pre_asignacion';
  if (input.status === 'request_received') {
    return input.assignedAt ? 'en_camino' : 'pre_asignacion';
  }
  if (EN_CAMINO.has(input.status)) return 'en_camino';
  if (input.status === 'waiting') return 'llegado';
  if (TERMINAL.has(input.status)) return 'forbidden';
  return 'forbidden';
}

export function evaluateCancel(input: EvaluateCancelInput): CancelDecision {
  const bucket = resolveBucket(input);
  if (bucket === 'forbidden') {
    return deny(input, 'en_camino', 'CANCEL_NOT_ALLOWED');
  }

  if (bucket === 'pre_asignacion') {
    if (input.actor === 'passenger') {
      return allow(input, 'pre_asignacion', 0, false, false);
    }
    if (input.actor === 'system') {
      const elapsed = elapsedS(input.createdAt, input.now) ?? 0;
      if (elapsed >= input.config.searchTimeoutS) {
        return allow(input, 'pre_asignacion', 0, false, false);
      }
      return deny(input, 'pre_asignacion', 'CANCEL_NOT_ALLOWED');
    }
    return deny(input, 'pre_asignacion', 'CANCEL_NOT_ALLOWED');
  }

  if (bucket === 'en_camino') {
    if (input.actor === 'passenger') {
      const elapsed = elapsedS(input.assignedAt, input.now);
      const pastGrace = elapsed !== null && elapsed >= input.config.graceS;
      const fee = pastGrace ? input.config.feeArs : 0;
      return allow(input, 'en_camino', fee, fee > 0, false);
    }
    if (input.actor === 'driver') {
      return allow(input, 'en_camino', 0, false, true);
    }
    return deny(input, 'en_camino', 'CANCEL_NOT_ALLOWED');
  }

  if (input.actor === 'passenger') {
    return allow(input, 'llegado', input.config.feeArs, true, false);
  }
  if (input.actor === 'driver') {
    const elapsed = elapsedS(input.waitingSince, input.now);
    if (elapsed === null || elapsed < input.config.waitS) {
      return deny(input, 'llegado', 'NO_SHOW_TOO_EARLY');
    }
    return allow(input, 'llegado', input.config.feeArs, true, false);
  }
  return deny(input, 'llegado', 'CANCEL_NOT_ALLOWED');
}
