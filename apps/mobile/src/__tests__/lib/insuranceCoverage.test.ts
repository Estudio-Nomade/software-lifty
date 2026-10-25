import {
  INSURANCE_COVERAGE_OPTIONS,
  INSURANCE_COVERAGE_TYPES,
  insuranceCoverageFromApi,
  insuranceCoverageLabel,
  insuranceCoverageToApi,
} from '../../lib/insuranceCoverage';

describe('insuranceCoverage', () => {
  it('exposes both options', () => {
    expect([...INSURANCE_COVERAGE_TYPES]).toEqual(['third_party', 'comprehensive']);
    expect(INSURANCE_COVERAGE_OPTIONS.map((o) => o.api)).toEqual([
      'third_party',
      'comprehensive',
    ]);
  });

  it('maps ui ↔ api', () => {
    expect(insuranceCoverageToApi('Contra terceros')).toBe('third_party');
    expect(insuranceCoverageToApi('Todo riesgo')).toBe('comprehensive');
    expect(insuranceCoverageLabel('third_party')).toBe('Contra terceros');
    expect(insuranceCoverageLabel('comprehensive')).toBe('Todo riesgo');
  });

  it('parses api values', () => {
    expect(insuranceCoverageFromApi('third_party')).toBe('third_party');
    expect(insuranceCoverageFromApi('COMPREHENSIVE')).toBe('comprehensive');
    expect(insuranceCoverageFromApi(null)).toBeNull();
    expect(insuranceCoverageFromApi('todo_riesgo')).toBeNull();
  });
});
