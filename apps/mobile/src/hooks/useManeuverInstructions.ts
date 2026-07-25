import { useRef } from 'react';
import { computeInstruction } from '../lib/instructions';
import type { ManeuverStep } from '../lib/instructions';

export type { ManeuverStep };

export function useManeuverInstructions(
  steps: ManeuverStep[],
  lat: number | null,
  lng: number | null,
): { instruction: string | null } {
  const currentStepIndexRef = useRef(0);
  const prevStepsLengthRef = useRef(steps.length);

  if (steps.length !== prevStepsLengthRef.current) {
    currentStepIndexRef.current = 0;
    prevStepsLengthRef.current = steps.length;
  }

  const result = computeInstruction(steps, lat, lng, currentStepIndexRef.current);

  if (result.advanced) {
    currentStepIndexRef.current = result.newIndex;
  }

  return { instruction: result.instruction };
}
