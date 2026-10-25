/** API values for vehicles.insurance_coverage_type (moto póliza). */
export const INSURANCE_COVERAGE_TYPES = ['third_party', 'comprehensive'] as const;
export type InsuranceCoverageType = (typeof INSURANCE_COVERAGE_TYPES)[number];

export type InsuranceCoverageUi = 'Contra terceros' | 'Todo riesgo';

const API_TO_UI: Record<InsuranceCoverageType, InsuranceCoverageUi> = {
  third_party: 'Contra terceros',
  comprehensive: 'Todo riesgo',
};

const UI_TO_API: Record<InsuranceCoverageUi, InsuranceCoverageType> = {
  'Contra terceros': 'third_party',
  'Todo riesgo': 'comprehensive',
};

export const INSURANCE_COVERAGE_OPTIONS: {
  api: InsuranceCoverageType;
  label: InsuranceCoverageUi;
}[] = [
  { api: 'third_party', label: 'Contra terceros' },
  { api: 'comprehensive', label: 'Todo riesgo' },
];

export function insuranceCoverageToApi(ui: InsuranceCoverageUi): InsuranceCoverageType {
  return UI_TO_API[ui];
}

export function insuranceCoverageFromApi(
  raw: string | null | undefined,
): InsuranceCoverageType | null {
  if (raw == null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'third_party' || normalized === 'comprehensive') {
    return normalized;
  }
  return null;
}

export function insuranceCoverageLabel(api: InsuranceCoverageType): InsuranceCoverageUi {
  return API_TO_UI[api];
}

/** Inline gate copy when moto has not picked coverage yet. */
export const MOTO_INSURANCE_COVERAGE_REQUIRED_MSG =
  'Elegí el tipo de cobertura de tu póliza: contra terceros o todo riesgo.';

export const MOTO_INSURANCE_COVERAGE_HINT =
  'Elegí el tipo de cobertura de tu póliza. Podés subir todo riesgo o contra terceros.';
