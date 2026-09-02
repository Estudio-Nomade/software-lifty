// Canonical set of document types required to complete onboarding. Must stay in
// sync with the mobile DOC_SIDES mapping (apps/mobile/src/utils/upload.ts).
// A criminal-background certificate is usually single-sided, so only the front
// is required (no `background_check_back`).
export const DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'insurance_back',
  'background_check_front',
  'rndg_front',
] as const;

export type DocType = (typeof DOC_TYPES)[number];
