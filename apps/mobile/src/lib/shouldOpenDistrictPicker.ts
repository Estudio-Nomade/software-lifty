import { ApiError } from '../api/types';

export function isDistrictRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'DISTRICT_REQUIRED';
}

export function shouldOpenDistrictPicker(args: {
  hasDistrict: boolean | undefined;
  error?: unknown;
}): boolean {
  if (args.error != null && isDistrictRequiredError(args.error)) return true;
  return args.hasDistrict === false;
}
