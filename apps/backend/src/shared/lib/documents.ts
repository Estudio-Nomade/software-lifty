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

/** Spanish labels for ops / push / mail (per-doc review). */
export const DOC_TYPE_LABELS: Record<string, string> = {
  license_front: 'Licencia (frente)',
  license_back: 'Licencia (dorso)',
  registration_front: 'Cédula verde (frente)',
  registration_back: 'Cédula verde (dorso)',
  insurance_front: 'Seguro del vehículo',
  insurance_back: 'Seguro del vehículo (dorso)',
  platform_rc_insurance_front: 'Seguro RC plataforma',
  background_check_front: 'Antecedentes penales',
  background_check_back: 'Antecedentes penales (dorso)',
  rndg_front: 'RNDG',
};

export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType] ?? docType;
}

/**
 * Max concurrent non-superseded files per (driver_id, doc_type).
 * Lets drivers split long policies / multi-page papers across several photos
 * when a single shot does not fit. PDF multipage still counts as one file.
 */
export const MAX_ACTIVE_FILES_PER_DOC_TYPE = 5;
