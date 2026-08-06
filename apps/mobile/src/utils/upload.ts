import { apiClient } from '../api/client';

export type DocBase =
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'background_check'
  | 'rndg';
export type DocSide = 'front' | 'back';

export const DOC_SIDES: Record<DocBase, DocSide[]> = {
  drivers_license: ['front', 'back'],
  vehicle_registration: ['front', 'back'],
  vehicle_insurance: ['front', 'back'],
  background_check: ['front'],
  rndg: ['front'],
};

const DOC_BASE_MAP: Record<DocBase, string> = {
  drivers_license: 'license',
  vehicle_registration: 'registration',
  vehicle_insurance: 'insurance',
  background_check: 'background_check',
  rndg: 'rndg',
};

export function toBackendDocType(base: DocBase, side: DocSide): string {
  return `${DOC_BASE_MAP[base]}_${side}`;
}

export async function uploadDocumentToBackend(
  uri: string,
  fileName: string,
  mimeType: string,
  docBase: DocBase,
  side: DocSide,
): Promise<{ file_url: string; id?: string }> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('doc_type', toBackendDocType(docBase, side));

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
): Promise<{
  id: string;
  doc_type: string;
  file_url: string;
  status: string;
  requires_review: boolean;
}> {
  const formData = new FormData();

  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('doc_type', toBackendDocType(docBase, side));

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
