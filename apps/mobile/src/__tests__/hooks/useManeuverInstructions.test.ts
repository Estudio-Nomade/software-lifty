import { computeInstruction } from '../../lib/instructions';
import type { ManeuverStep } from '../../lib/instructions';

function createStep(overrides: Partial<ManeuverStep> = {}): ManeuverStep {
  return {
    maneuver_type: 'turn',
    maneuver_modifier: 'right',
    name: 'Av. Corrientes',
    distance: 200,
    geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    ...overrides,
  };
}

describe('computeInstruction', () => {
  test('returns null when lat is null', () => {
    const steps = [createStep()];
    const result = computeInstruction(steps, null, -58.3816, 0);
    expect(result.instruction).toBeNull();
  });

  test('returns null when lng is null', () => {
    const steps = [createStep()];
    const result = computeInstruction(steps, -34.6037, null, 0);
    expect(result.instruction).toBeNull();
  });

  test('returns null when steps is empty', () => {
    const result = computeInstruction([], -34.6037, -58.3816, 0);
    expect(result.instruction).toBeNull();
  });

  test('skips depart step', () => {
    const steps = [
      createStep({
        maneuver_type: 'depart',
        name: 'Start St',
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'right',
        name: 'Av. Corrientes',
        distance: 200,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).not.toBeNull();
    expect(result.instruction).not.toBe('');
  });

  test('returns instruction with distance, action and street name', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'right',
        name: 'Av. Corrientes',
        distance: 200,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).not.toBeNull();
    expect(result.instruction).toContain('Girar a la derecha');
    expect(result.instruction).toContain('Av. Corrientes');
  });

  test('returns instruction without street name if empty', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'left',
        name: '',
        distance: 300,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).not.toBeNull();
    expect(result.instruction).toContain('Girar a la izquierda');
  });

  test('returns null when past all steps', () => {
    const steps: ManeuverStep[] = [];
    const result = computeInstruction(steps, -34.6037, -58.3816, 3);
    expect(result.instruction).toBeNull();
  });

  test('shows arrive message for last step', () => {
    const steps = [
      createStep({
        maneuver_type: 'arrive',
        name: '',
        distance: 50,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).toBe('Llegando a destino');
  });

  test('returns null for depart-only steps', () => {
    const steps = [
      createStep({
        maneuver_type: 'depart',
        name: 'Start St',
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).toBeNull();
  });

  test('handles step with empty geometry gracefully', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'left',
        name: 'Test St',
        distance: 100,
        geometry: '',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.instruction).toBeNull();
  });

  test('returns advance flags when step completed', () => {
    const steps = [
      createStep({
        maneuver_type: 'turn',
        maneuver_modifier: 'left',
        name: 'Test St',
        distance: 100,
        geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      }),
    ];

    const result = computeInstruction(steps, -34.6037, -58.3816, 0);
    expect(result.advanced).toBe(false);
  });
});
