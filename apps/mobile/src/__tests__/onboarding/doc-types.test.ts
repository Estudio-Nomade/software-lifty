import {
  allowsPdfDoc,
  DOC_SIDES,
  type DocBase,
  MAX_PDF_UPLOAD_BYTES,
  PDF_TOO_LARGE_MSG,
  toBackendDocType,
  validateDocFileSize,
} from '../../utils/upload';

// Must match apps/backend/src/shared/lib/documents.ts DOC_TYPES
// (no background_check_back, no insurance_back — single file/policy;
// platform_rc_insurance_front required, distinct from insurance_front).
const BACKEND_REQUIRED_DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'platform_rc_insurance_front',
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
    expect(toBackendDocType('platform_rc_insurance', 'front')).toBe(
      'platform_rc_insurance_front',
    );
    expect(toBackendDocType('background_check', 'front')).toBe('background_check_front');
    expect(toBackendDocType('rndg', 'front')).toBe('rndg_front');
  });
});

describe('DOC_SIDES ↔ backend DOC_TYPES alignment', () => {
  it('background_check, rndg, vehicle_insurance and platform_rc_insurance are front-only', () => {
    expect(DOC_SIDES.background_check).toEqual(['front']);
    expect(DOC_SIDES.rndg).toEqual(['front']);
    expect(DOC_SIDES.vehicle_insurance).toEqual(['front']);
    expect(DOC_SIDES.platform_rc_insurance).toEqual(['front']);
  });

  it('mobile required set equals backend required set', () => {
    expect(mobileRequiredDocTypes().sort()).toEqual([...BACKEND_REQUIRED_DOC_TYPES].sort());
  });

  it('does not require background_check_back or insurance_back', () => {
    expect(mobileRequiredDocTypes()).not.toContain('background_check_back');
    expect(mobileRequiredDocTypes()).not.toContain('insurance_back');
  });
});

describe('allowsPdfDoc', () => {
  it('enables PDF for seguros, antecedentes and RNDG', () => {
    expect(allowsPdfDoc('vehicle_insurance')).toBe(true);
    expect(allowsPdfDoc('platform_rc_insurance')).toBe(true);
    expect(allowsPdfDoc('background_check')).toBe(true);
    expect(allowsPdfDoc('rndg')).toBe(true);
  });

  it('keeps license and registration photo-only in UI', () => {
    expect(allowsPdfDoc('drivers_license')).toBe(false);
    expect(allowsPdfDoc('vehicle_registration')).toBe(false);
    expect(allowsPdfDoc(undefined)).toBe(false);
  });
});

describe('validateDocFileSize', () => {
  it('rejects PDF over 5 MB with actionable copy', () => {
    expect(
      validateDocFileSize({ fileSize: MAX_PDF_UPLOAD_BYTES + 1, isPdf: true }),
    ).toBe(PDF_TOO_LARGE_MSG);
    expect(validateDocFileSize({ fileSize: MAX_PDF_UPLOAD_BYTES, isPdf: true })).toBeNull();
  });

  it('keeps images at 10 MB cap', () => {
    expect(validateDocFileSize({ fileSize: 9 * 1024 * 1024, isPdf: false })).toBeNull();
    expect(validateDocFileSize({ fileSize: 11 * 1024 * 1024, isPdf: false })).toMatch(/10 MB/);
  });

  it('skips when size is unknown', () => {
    expect(validateDocFileSize({ fileSize: null, isPdf: true })).toBeNull();
    expect(validateDocFileSize({ fileSize: undefined, isPdf: false })).toBeNull();
  });
});
