import { ApiError } from '../../api/types';
import {
  hasDistrictFromCache,
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

describe('post-assign connect gate', () => {
  it('does not reopen picker once has_district is true', () => {
    const fresh = hasDistrictFromCache({ has_district: true });
    expect(fresh).toBe(true);
    expect(shouldOpenDistrictPicker({ hasDistrict: fresh })).toBe(false);
  });

  it('still opens when cache says no district after assign failed/stale', () => {
    const cached = hasDistrictFromCache({ has_district: false });
    expect(shouldOpenDistrictPicker({ hasDistrict: cached })).toBe(true);
  });

  it('still opens on DISTRICT_REQUIRED even if cache said true', () => {
    const err = new ApiError({
      error: {
        code: 'DISTRICT_REQUIRED',
        message: 'Debes seleccionar un municipio antes de conectarte.',
        status: 400,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    const fresh = hasDistrictFromCache({ has_district: true });
    expect(shouldOpenDistrictPicker({ hasDistrict: fresh, error: err })).toBe(true);
  });

  it('hasDistrictFromCache returns undefined for missing cache', () => {
    expect(hasDistrictFromCache(undefined)).toBeUndefined();
    expect(hasDistrictFromCache(null)).toBeUndefined();
    expect(hasDistrictFromCache({})).toBeUndefined();
  });
});
