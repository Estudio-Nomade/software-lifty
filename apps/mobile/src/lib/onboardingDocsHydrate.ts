import type { DriverDocument } from '../api/types';

/** Keep in sync with utils/upload MAX_FILES_PER_DOC_SIDE + backend MAX_ACTIVE_FILES_PER_DOC_TYPE. */
const MAX_FILES_PER_DOC_SIDE = 5;

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

export type HydratedFilePart = {
  id?: string;
  fileUri: string | null;
  fileName: string | null;
  fileUrl: string | null;
  isPdf: boolean;
  serverStatus: ServerDocStatus;
  reviewComment: string | null;
};

export type HydratedSideState = {
  uploaded: boolean;
  needsReplace: boolean;
  replacedInSession: boolean;
  serverStatus: ServerDocStatus;
  /** Latest / primary file (compat with single-file UI). */
  fileUri: string | null;
  fileName: string | null;
  fileUrl: string | null;
  isPdf: boolean;
  /** All active pages/photos for this side (multi-shot). */
  files: HydratedFilePart[];
  uploading: boolean;
  error: string | null;
  /** Ops comment on this side (any active file with review_comment). */
  reviewComment: string | null;
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
    files: [],
    uploading: false,
    error: null,
    reviewComment: null,
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

function statusRank(status: ServerDocStatus): number {
  if (status === 'rejected') return 3;
  if (status === 'pending_review') return 2;
  if (status === 'approved') return 1;
  return 0;
}

function foldSideStatus(files: HydratedFilePart[]): ServerDocStatus {
  let best: ServerDocStatus = null;
  for (const f of files) {
    if (statusRank(f.serverStatus) > statusRank(best)) best = f.serverStatus;
  }
  return best;
}

function labelForPart(
  status: ServerDocStatus,
  isPdf: boolean,
  index: number,
  total: number,
): string {
  const n = total > 1 ? ` ${index + 1}/${total}` : '';
  if (status === 'rejected') return `Rehacer${n}`;
  if (isPdf) return `PDF cargado${n}`;
  return total > 1 ? `Foto${n}` : 'Documento cargado';
}

/**
 * Map GET /drivers/me/documents rows into onboarding side state.
 * Multiple non-superseded rows of the same doc_type = multi-page / multi-shot.
 * approved / pending_review → satisfied (uploaded) unless any is rejected without replace.
 * rejected → needsReplace (not satisfied until re-upload this session).
 */
export function hydrateDocsFromApi(documents: DriverDocument[]): HydratedDocsState {
  const state = emptyHydratedDocs();
  const buckets = new Map<string, HydratedFilePart[]>();

  for (const row of documents) {
    if (row.status === 'superseded') continue;
    const mapped = BACKEND_TO_MOBILE[row.doc_type];
    if (!mapped) continue;

    const { base, side } = mapped;
    if (!DOC_SIDES[base].includes(side)) continue;

    const key = `${base}:${side}`;
    const status = (row.status ?? 'pending_review') as ServerDocStatus;
    const part: HydratedFilePart = {
      id: row.id,
      fileUri: null,
      fileName: null,
      fileUrl: row.file_url ?? null,
      isPdf: isPdfUrl(row.file_url),
      serverStatus: status,
      reviewComment: row.review_comment?.trim() || null,
    };
    const list = buckets.get(key) ?? [];
    list.push(part);
    buckets.set(key, list);
  }

  for (const [key, parts] of buckets) {
    const [base, side] = key.split(':') as [DocBase, DocSide];
    const capped = parts.slice(0, MAX_FILES_PER_DOC_SIDE);
    const total = capped.length;
    const labeled = capped.map((p, i) => ({
      ...p,
      fileName: labelForPart(p.serverStatus, p.isPdf, i, total),
    }));
    const status = foldSideStatus(labeled);
    const rejected = status === 'rejected';
    const ok = status === 'approved' || status === 'pending_review';
    const primary = labeled[labeled.length - 1]!;
    const reviewComment =
      labeled.map((p) => p.reviewComment).find((c) => c && c.length > 0) ?? null;

    state[base][side] = {
      uploaded: ok,
      needsReplace: rejected,
      replacedInSession: false,
      serverStatus: status,
      fileUri: null,
      fileName: rejected
        ? total > 1
          ? `Rehacer (${total})`
          : 'Rehacer'
        : ok
          ? total > 1
            ? `${total} archivos`
            : primary.fileName
          : null,
      fileUrl: primary.fileUrl,
      isPdf: labeled.some((p) => p.isPdf),
      files: labeled,
      uploading: false,
      error: null,
      reviewComment,
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

export function canAppendMoreFiles(side: HydratedSideState): boolean {
  const n = side.files.length > 0 ? side.files.length : side.uploaded || side.fileUrl ? 1 : 0;
  return n < MAX_FILES_PER_DOC_SIDE;
}
