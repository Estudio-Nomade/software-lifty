// Canonical set of document types required to complete onboarding. Must stay in
// sync with the mobile DOC_SIDES mapping (apps/mobile/src/utils/upload.ts).
// A criminal-background certificate is usually single-sided, so only the front
// is required (no `background_check_back`).
// Vehicle insurance is typically a single PDF policy (or one photo); dorso is
// not required (no `insurance_back` in required set).
// Platform RC insurance (SSN / "Conductor digital") is a separate single-file
// requirement from personal vehicle insurance (`insurance_front`).
export const DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'platform_rc_insurance_front',
  'background_check_front',
  'rndg_front',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// Accepted on upload/reupload but not required for hasAllRequiredDocs.
// Keeps legacy insurance_back rows and clients from 400-ing.
export const OPTIONAL_DOC_TYPES = ['insurance_back'] as const;

export const VALID_DOC_TYPES = [...DOC_TYPES, ...OPTIONAL_DOC_TYPES] as const;

export type ValidDocType = (typeof VALID_DOC_TYPES)[number];

/**
 * Max concurrent non-superseded files per (driver_id, doc_type).
 * Lets drivers split long policies / multi-page papers across several photos
 * when a single shot does not fit. PDF multipage still counts as one file.
 */
export const MAX_ACTIVE_FILES_PER_DOC_TYPE = 5;
