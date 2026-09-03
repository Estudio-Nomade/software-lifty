import { ApiError } from '../../api/types';
import {
  isDistrictRequiredError,
  shouldOpenDistrictPicker,
} from '../../lib/shouldOpenDistrictPicker';

describe('shouldOpenDistrictPicker', () => {
  it('opens when hasDistrict is false', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: false })).toBe(true);
  });

  it('opens when hasDistrict is undefined (unknown)', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: undefined })).toBe(false);
  });

  it('does not open when hasDistrict is true', () => {
    expect(shouldOpenDistrictPicker({ hasDistrict: true })).toBe(false);
  });

  it('opens on DISTRICT_REQUIRED even if hasDistrict was true (stale)', () => {
    const err = new ApiError({
      error: {
        code: 'DISTRICT_REQUIRED',
        message: 'Debes seleccionar un municipio antes de conectarte.',
        status: 400,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    expect(shouldOpenDistrictPicker({ hasDistrict: true, error: err })).toBe(true);
    expect(isDistrictRequiredError(err)).toBe(true);
  });
});
