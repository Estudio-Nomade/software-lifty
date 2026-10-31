import { apiClient } from '../api/client';

export type DocBase =
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'platform_rc_insurance'
  | 'background_check'
  | 'rndg';
export type DocSide = 'front' | 'back';

/** Must match backend MAX_ACTIVE_FILES_PER_DOC_TYPE. */
export const MAX_FILES_PER_DOC_SIDE = 5;

export const DOC_SIDES: Record<DocBase, DocSide[]> = {
  drivers_license: ['front', 'back'],
  vehicle_registration: ['front', 'back'],
  vehicle_insurance: ['front'],
  platform_rc_insurance: ['front'],
  background_check: ['front'],
  rndg: ['front'],
};

/** Docs that offer Archivo PDF / + PDF in onboarding + profile reupload. BE accepts PDF for all. */
const PDF_UPLOAD_DOC_BASES: ReadonlySet<DocBase> = new Set([
  'vehicle_insurance',
  'platform_rc_insurance',
  'background_check',
  'rndg',
]);

export function allowsPdfDoc(docType: DocBase | undefined | null): boolean {
  return docType != null && PDF_UPLOAD_DOC_BASES.has(docType);
}

/** Images are compressed client-side; hard cap stays generous. */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
/** PDFs are not compressed on device — keep a tighter product limit. */
export const MAX_PDF_UPLOAD_BYTES = 5 * 1024 * 1024;

export const PDF_TOO_LARGE_MSG =
  'El PDF supera 5 MB. Reducilo a 5 MB o menos, o subí una foto del documento.';

export const IMAGE_TOO_LARGE_MSG = 'La imagen debe pesar menos de 10 MB.';

/** Returns a user-facing error, or null if size is OK / unknown. */
export function validateDocFileSize(opts: {
  fileSize: number | null | undefined;
  isPdf: boolean;
}): string | null {
  const size = opts.fileSize;
  if (size == null || !Number.isFinite(size) || size <= 0) return null;
  if (opts.isPdf) {
    return size > MAX_PDF_UPLOAD_BYTES ? PDF_TOO_LARGE_MSG : null;
  }
  return size > MAX_IMAGE_UPLOAD_BYTES ? IMAGE_TOO_LARGE_MSG : null;
}

const DOC_BASE_MAP: Record<DocBase, string> = {
  drivers_license: 'license',
  vehicle_registration: 'registration',
  vehicle_insurance: 'insurance',
  platform_rc_insurance: 'platform_rc_insurance',
  background_check: 'background_check',
  rndg: 'rndg',
};

export function toBackendDocType(base: DocBase, side: DocSide): string {
  return `${DOC_BASE_MAP[base]}_${side}`;
}

export type DocUploadResult = {
  file_url: string;
  id?: string;
  active_count?: number;
  max_files?: number;
  replaced_group?: boolean;
};

export type DocReuploadResult = {
  id: string;
  doc_type: string;
  file_url: string;
  status: string;
  requires_review: boolean;
  active_count?: number;
  max_files?: number;
  replaced_group?: boolean;
};

export type UploadDocOptions = {
  /**
   * true → supersede all active files of this doc_type first.
   * false → append another page/photo (default for onboarding multi-shot).
   * omit → backend default (upload: append, reupload: replace).
   */
  replaceGroup?: boolean;
};

export async function uploadDocumentToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
  docBase: DocBase,
  side: DocSide,
  options?: UploadDocOptions,
): Promise<DocUploadResult> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('doc_type', toBackendDocType(docBase, side));
  if (options?.replaceGroup !== undefined) {
    formData.append('replace_group', options.replaceGroup ? 'true' : 'false');
  }

  const { data } = await apiClient.post('/drivers/me/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}

export async function reuploadDocumentToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
  docBase: DocBase,
  side: DocSide,
  options?: UploadDocOptions,
): Promise<DocReuploadResult> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('doc_type', toBackendDocType(docBase, side));
  if (options?.replaceGroup !== undefined) {
    formData.append('replace_group', options.replaceGroup ? 'true' : 'false');
  }

  const { data } = await apiClient.post('/drivers/me/documents/reupload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}

export async function uploadPhotoToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<{ file_url: string }> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);

  const { data } = await apiClient.post('/drivers/me/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}

export async function uploadCommissionReceipt(
  uri: string,
  fileName: string,
  mimeType: string,
  amountArs: number,
): Promise<{ receipt: { id: string; status: string }; platform_debt: number }> {
  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('amount_ars', String(amountArs));

  const { data } = await apiClient.post('/drivers/me/commission-receipts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}
