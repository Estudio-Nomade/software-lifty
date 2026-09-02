import { DOC_SIDES, type DocBase, toBackendDocType } from '../../utils/upload';

// Must match apps/backend/src/shared/lib/documents.ts DOC_TYPES (no background_check_back).
const BACKEND_REQUIRED_DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'insurance_back',
  'background_check_front',
  'rndg_front',
] as const;

function mobileRequiredDocTypes(): string[] {
  return (Object.keys(DOC_SIDES) as DocBase[]).flatMap((base) =>
    DOC_SIDES[base].map((side) => toBackendDocType(base, side)),
  );
}

describe('toBackendDocType', () => {
  it('maps every base doc and side to the backend doc_type', () => {
    expect(toBackendDocType('drivers_license', 'front')).toBe('license_front');
    expect(toBackendDocType('drivers_license', 'back')).toBe('license_back');
    expect(toBackendDocType('vehicle_registration', 'front')).toBe('registration_front');
    expect(toBackendDocType('vehicle_registration', 'back')).toBe('registration_back');
    expect(toBackendDocType('vehicle_insurance', 'front')).toBe('insurance_front');
    expect(toBackendDocType('vehicle_insurance', 'back')).toBe('insurance_back');
    expect(toBackendDocType('background_check', 'front')).toBe('background_check_front');
    expect(toBackendDocType('rndg', 'front')).toBe('rndg_front');
  });
});

describe('DOC_SIDES ↔ backend DOC_TYPES alignment', () => {
  it('background_check and rndg are front-only', () => {
    expect(DOC_SIDES.background_check).toEqual(['front']);
    expect(DOC_SIDES.rndg).toEqual(['front']);
  });

  it('mobile required set equals backend required set', () => {
    expect(mobileRequiredDocTypes().sort()).toEqual([...BACKEND_REQUIRED_DOC_TYPES].sort());
  });

  it('does not require background_check_back', () => {
    expect(mobileRequiredDocTypes()).not.toContain('background_check_back');
  });
});
