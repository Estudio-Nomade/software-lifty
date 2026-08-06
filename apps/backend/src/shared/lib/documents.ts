export const DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'insurance_back',
  'background_check_front',
  'background_check_back',
  'rndg_front',
] as const;

export type DocType = (typeof DOC_TYPES)[number];
