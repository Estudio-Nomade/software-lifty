import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

let supabase: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (url && key) {
      supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }
  return supabase;
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      logger.warn('[STORAGE] Retry', { attempt: i + 1, error: (err as Error).message });
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** Ops-friendly folder label from full_name; path-safe, keeps spaces. */
export function sanitizeDriverFolderName(fullName: string | null | undefined): string {
  const cleaned = (fullName ?? '')
    .normalize('NFC')
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || '/\\?%*:|"<>'.includes(ch)) return ' ';
      return ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .replace(/\.+$/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : 'sin-nombre';
}

export function extensionForMime(mime: string | null | undefined): string {
  if (!mime) return 'jpg';
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_EXT[base] ?? 'jpg';
}

export function contentTypeForFile(file: { type?: string; name?: string }): string {
  const raw = file.type?.split(';')[0]?.trim().toLowerCase();
  if (raw && MIME_EXT[raw]) return raw === 'image/jpg' ? 'image/jpeg' : raw;
  const name = file.name ?? '';
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return 'image/jpeg';
}

export function buildDriverDocumentPath(opts: {
  fullName: string | null | undefined;
  driverId: string;
  docType: string;
  file: { type?: string; name?: string };
  now?: number;
}): string {
  const folder = sanitizeDriverFolderName(opts.fullName);
  const shortId = opts.driverId.slice(0, 8);
  const ext = extensionForMime(contentTypeForFile(opts.file));
  const ts = opts.now ?? Date.now();
  return `drivers/${folder}_${shortId}/${opts.docType}-${ts}.${ext}`;
}

export function buildDriverAvatarPath(opts: {
  fullName: string | null | undefined;
  ownerId: string;
  file: { type?: string; name?: string };
  now?: number;
}): string {
  const folder = sanitizeDriverFolderName(opts.fullName);
  const shortId = opts.ownerId.slice(0, 8);
  const ext = extensionForMime(contentTypeForFile(opts.file));
  const ts = opts.now ?? Date.now();
  return `avatars/${folder}_${shortId}-${ts}.${ext}`;
}

export type UploadFileOptions = {
  contentType?: string;
};

export async function uploadFile(
  file: File,
  path: string,
  options?: UploadFileOptions,
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.',
    );
  }

  const contentType = options?.contentType ?? contentTypeForFile(file);
  const { data, error } = await retry(() =>
    client.storage.from('driver-documents').upload(path, file, {
      upsert: true,
      contentType,
    }),
  );
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = client.storage.from('driver-documents').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.',
    );
  }

  const { data, error } = await retry(() =>
    client.storage.from('driver-documents').createSignedUrl(path, expiresIn),
  );
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const client = getClient();
  if (!client) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.',
    );
  }

  try {
    const { error } = await retry(() => client.storage.from('driver-documents').remove([path]));
    if (error) {
      logger.warn('[STORAGE] Delete failed', { path, error: error.message });
    }
  } catch (err) {
    logger.warn('[STORAGE] Delete error', { path, error: (err as Error).message });
  }
}

export function extractStoragePath(url: string | null): string | null {
  if (!url) return null;

  const match = url.match(/(?:\/public\/driver-documents\/|\/sign\/driver-documents\/)(.+)/);
  return match ? match[1] : null;
}

export interface StorageProvider {
  uploadFile(file: File, path: string, options?: UploadFileOptions): Promise<string>;
  deleteFile(path: string): Promise<void>;
  extractStoragePath(url: string | null): string | null;
}

export const supabaseStorage: StorageProvider = {
  uploadFile,
  deleteFile,
  extractStoragePath,
};
