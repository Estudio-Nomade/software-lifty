// Canonical set of document types required to complete onboarding. Must stay in
// sync with the mobile DOC_SIDES mapping (apps/mobile/src/utils/upload.ts).
// A criminal-background certificate is usually single-sided, so only the front
// is required (no `background_check_back`).
// Vehicle insurance is typically a single PDF policy (or one photo); dorso is
// not required (no `insurance_back` in required set).
export const DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'background_check_front',
  'rndg_front',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// Accepted on upload/reupload but not required for hasAllRequiredDocs.
// Keeps legacy insurance_back rows and clients from 400-ing.
export const OPTIONAL_DOC_TYPES = ['insurance_back'] as const;

export const VALID_DOC_TYPES = [...DOC_TYPES, ...OPTIONAL_DOC_TYPES] as const;

export type ValidDocType = (typeof VALID_DOC_TYPES)[number];
