import type { DriverDocument } from '../api/types';
import type { DocBase, DocSide } from './onboardingDocsHydrate';
import { DOC_SIDES } from './onboardingDocsHydrate';

/** Backend doc_type → mobile DocBase + side (mirror onboardingDocsHydrate). */
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

export type PreviewFileStatus = 'pending_review' | 'approved' | 'rejected' | 'superseded' | null;

export type ReuploadPreviewFile = {
  id: string;
  fileUrl: string;
  isPdf: boolean;
  status: PreviewFileStatus;
  reviewComment: string | null;
  side: DocSide;
};

export type ReuploadPreviewBySide = Record<DocSide, ReuploadPreviewFile[]>;

export type ReuploadPreviewPartition = {
  current: ReuploadPreviewBySide;
  previous: ReuploadPreviewBySide;
  hasCurrent: boolean;
  hasPrevious: boolean;
};

function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.includes('application/pdf');
}

function emptyBySide(): ReuploadPreviewBySide {
  return { front: [], back: [] };
}

function toPreview(row: DriverDocument, side: DocSide): ReuploadPreviewFile {
  return {
    id: row.id,
    fileUrl: row.file_url,
    isPdf: isPdfUrl(row.file_url),
    status: (row.status ?? 'pending_review') as PreviewFileStatus,
    reviewComment: row.review_comment?.trim() || null,
    side,
  };
}

/**
 * Split GET /drivers/me/documents (optionally with superseded) into current +
 * last superseded generation for one mobile doc base.
 */
export function partitionReuploadPreview(
  documents: DriverDocument[],
  docBase: DocBase,
): ReuploadPreviewPartition {
  const allowedSides = new Set(DOC_SIDES[docBase]);
  const current = emptyBySide();
  const previous = emptyBySide();

  const active: DriverDocument[] = [];
  const superseded: DriverDocument[] = [];

  for (const row of documents) {
    const mapped = BACKEND_TO_MOBILE[row.doc_type];
    if (!mapped || mapped.base !== docBase) continue;
    if (!allowedSides.has(mapped.side)) continue;
    if (row.status === 'superseded') superseded.push(row);
    else active.push(row);
  }

  for (const row of active) {
    const mapped = BACKEND_TO_MOBILE[row.doc_type]!;
    current[mapped.side].push(toPreview(row, mapped.side));
  }

  // Last generation per backend doc_type (replace_group batch shares superseded_at).
  const latestAtByType = new Map<string, string>();
  for (const row of superseded) {
    const at = row.superseded_at ?? row.created_at;
    const prev = latestAtByType.get(row.doc_type);
    if (!prev || at > prev) latestAtByType.set(row.doc_type, at);
  }

  for (const row of superseded) {
    const latest = latestAtByType.get(row.doc_type);
    if (!latest) continue;
    const at = row.superseded_at ?? row.created_at;
    if (at !== latest) continue;
    const mapped = BACKEND_TO_MOBILE[row.doc_type]!;
    previous[mapped.side].push(toPreview(row, mapped.side));
  }

  const hasCurrent = current.front.length + current.back.length > 0;
  const hasPrevious = previous.front.length + previous.back.length > 0;

  return { current, previous, hasCurrent, hasPrevious };
}

export function emptyPreviewCopy(opts: {
  hasServerCurrent: boolean;
  hasLocalFiles: boolean;
}): string {
  if (opts.hasLocalFiles) return '';
  if (opts.hasServerCurrent) {
    return 'Elegí fotos nuevas para reemplazar el documento actual';
  }
  return 'Todavia no subiste nada';
}

export function statusBadgeEs(status: PreviewFileStatus): string {
  if (status === 'pending_review') return 'Pendiente de revisión';
  if (status === 'approved') return 'Verificado';
  if (status === 'rejected') return 'Rechazado';
  if (status === 'superseded') return 'Versión anterior';
  return 'Pendiente';
}
