import type { DriverDocument } from '../api/types';

/** Mirrors utils/upload DocBase / DocSide without importing apiClient (RN). */
export type DocBase =
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'platform_rc_insurance'
  | 'background_check'
  | 'rndg';
export type DocSide = 'front' | 'back';

export const DOC_SIDES: Record<DocBase, DocSide[]> = {
  drivers_license: ['front', 'back'],
  vehicle_registration: ['front', 'back'],
  vehicle_insurance: ['front'],
  platform_rc_insurance: ['front'],
  background_check: ['front'],
  rndg: ['front'],
};

/** Backend doc_type → mobile DocBase + side. */
const BACKEND_TO_MOBILE: Record<string, { base: DocBase; side: DocSide }> = {
  license_front: { base: 'drivers_license', side: 'front' },
  license_back: { base: 'drivers_license', side: 'back' },
  registration_front: { base: 'vehicle_registration', side: 'front' },
  registration_back: { base: 'vehicle_registration', side: 'back' },
  insurance_front: { base: 'vehicle_insurance', side: 'front' },
  insurance_back: { base: 'vehicle_insurance', side: 'back' },
  platform_rc_insurance_front: { base: 'platform_rc_insurance', side: 'front' },
  background_check_front: { base: 'background_check', side: 'front' },
  background_check_back: { base: 'background_check', side: 'back' },
  rndg_front: { base: 'rndg', side: 'front' },
};

export type ServerDocStatus = 'approved' | 'pending_review' | 'rejected' | null;

export type HydratedSideState = {
  uploaded: boolean;
  needsReplace: boolean;
  replacedInSession: boolean;
  serverStatus: ServerDocStatus;
  fileUri: string | null;
  fileName: string | null;
  fileUrl: string | null;
  isPdf: boolean;
  uploading: boolean;
  error: string | null;
};

export type HydratedDocsState = Record<DocBase, Record<DocSide, HydratedSideState>>;

function emptySide(): HydratedSideState {
  return {
    uploaded: false,
    needsReplace: false,
    replacedInSession: false,
    serverStatus: null,
    fileUri: null,
    fileName: null,
    fileUrl: null,
    isPdf: false,
    uploading: false,
    error: null,
  };
}

export function emptyHydratedDocs(): HydratedDocsState {
  return {
    drivers_license: { front: emptySide(), back: emptySide() },
    vehicle_registration: { front: emptySide(), back: emptySide() },
    vehicle_insurance: { front: emptySide(), back: emptySide() },
    platform_rc_insurance: { front: emptySide(), back: emptySide() },
    background_check: { front: emptySide(), back: emptySide() },
    rndg: { front: emptySide(), back: emptySide() },
  };
}

function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.includes('application/pdf');
}

/**
 * Map GET /drivers/me/documents rows into onboarding side state.
 * approved / pending_review → satisfied (uploaded).
 * rejected → needsReplace (not satisfied until re-upload this session).
 */
export function hydrateDocsFromApi(documents: DriverDocument[]): HydratedDocsState {
  const state = emptyHydratedDocs();

  for (const row of documents) {
    if (row.status === 'superseded') continue;
    const mapped = BACKEND_TO_MOBILE[row.doc_type];
    if (!mapped) continue;

    const { base, side } = mapped;
    if (!DOC_SIDES[base].includes(side)) continue;

    const status = (row.status ?? 'pending_review') as ServerDocStatus;
    const rejected = status === 'rejected';
    const ok = status === 'approved' || status === 'pending_review';

    state[base][side] = {
      uploaded: ok,
      needsReplace: rejected,
      replacedInSession: false,
      serverStatus: status,
      fileUri: null,
      fileName: rejected
        ? 'Rehacer'
        : ok
          ? isPdfUrl(row.file_url)
            ? 'PDF cargado'
            : 'Documento cargado'
          : null,
      fileUrl: row.file_url ?? null,
      isPdf: isPdfUrl(row.file_url),
      uploading: false,
      error: null,
    };
  }

  return state;
}

export function sideSatisfied(side: HydratedSideState): boolean {
  if (side.needsReplace) return side.replacedInSession;
  if (side.serverStatus === 'approved' || side.serverStatus === 'pending_review') return true;
  return side.uploaded;
}

export function allDocsSatisfied(docs: HydratedDocsState): boolean {
  return (Object.keys(DOC_SIDES) as DocBase[]).every((docType) =>
    DOC_SIDES[docType].every((side) => sideSatisfied(docs[docType][side])),
  );
}
