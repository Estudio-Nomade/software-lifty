import { ApiError } from '../api/types';

export function isDistrictRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'DISTRICT_REQUIRED';
}

/** Read has_district from driverStatus query cache (connect precheck input). */
export function hasDistrictFromCache(
  data: { has_district?: boolean } | undefined | null,
): boolean | undefined {
  return data?.has_district;
}

export function shouldOpenDistrictPicker(args: {
  hasDistrict: boolean | undefined;
  error?: unknown;
}): boolean {
  if (args.error != null && isDistrictRequiredError(args.error)) return true;
  return args.hasDistrict === false;
}
