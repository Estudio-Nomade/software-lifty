import { haversineDistance } from './geo';
import { getStepEndpoint, maneuverToText } from './maneuver';

export interface ManeuverStep {
  maneuver_type: string;
  maneuver_modifier?: string;
  name: string;
  distance: number;
  geometry: string;
}

const PROXIMITY_THRESHOLD_KM = 0.02;

export function computeInstruction(
  steps: ManeuverStep[],
  lat: number | null,
  lng: number | null,
  currentIndex: number,
): { instruction: string | null; advanced: boolean; newIndex: number } {
  if (!lat || !lng || steps.length === 0) {
    return { instruction: null, advanced: false, newIndex: currentIndex };
  }

  let idx = currentIndex;

  if (steps[0]?.maneuver_type === 'depart' && idx < 1) {
    idx = 1;
  }

  if (idx >= steps.length) {
    return { instruction: null, advanced: false, newIndex: idx };
  }

  const currentStep = steps[idx];
  const endpoint = getStepEndpoint(currentStep.geometry);
  if (!endpoint) {
    return { instruction: null, advanced: false, newIndex: idx };
  }

  const [endpointLng, endpointLat] = endpoint;
  const distKm = haversineDistance(lat, lng, endpointLat, endpointLng);

  if (distKm < PROXIMITY_THRESHOLD_KM) {
    const nextIdx = idx + 1;
    if (nextIdx >= steps.length) {
      return { instruction: null, advanced: true, newIndex: nextIdx };
    }

    const nextStep = steps[nextIdx];
    if (nextStep.maneuver_type === 'arrive') {
      return { instruction: 'Llegando a destino', advanced: true, newIndex: nextIdx };
    }

    const action = maneuverToText(nextStep.maneuver_type, nextStep.maneuver_modifier);
    if (!action) {
      return { instruction: null, advanced: true, newIndex: nextIdx };
    }

    const street = nextStep.name ? ` en ${nextStep.name}` : '';
    const meters = Math.round(nextStep.distance);
    return { instruction: `En ${meters}m, ${action}${street}`, advanced: true, newIndex: nextIdx };
  }

  if (currentStep.maneuver_type === 'arrive') {
    return { instruction: 'Llegando a destino', advanced: false, newIndex: idx };
  }

  const action = maneuverToText(currentStep.maneuver_type, currentStep.maneuver_modifier);
  if (!action) {
    return { instruction: null, advanced: false, newIndex: idx };
  }

  const street = currentStep.name ? ` en ${currentStep.name}` : '';
  const meters = Math.round(distKm * 1000);
  return { instruction: `En ${meters}m, ${action}${street}`, advanced: false, newIndex: idx };
}
