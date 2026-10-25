/**
 * Driver profile photo rules (ClickUp 1dfc7p9vqx2):
 * - Capture via camera only (no gallery) for onboarding + profile edit.
 * - Required to leave Paso 1 / complete profile.
 */

export function isDriverProfilePhotoPresent(photoUri: string | null | undefined): boolean {
  return typeof photoUri === 'string' && photoUri.trim().length > 0;
}

export function isDriverProfilePhotoRemote(photoUri: string | null | undefined): boolean {
  if (!isDriverProfilePhotoPresent(photoUri)) return false;
  const value = photoUri!.trim().toLowerCase();
  return value.startsWith('http://') || value.startsWith('https://');
}

export const DRIVER_PROFILE_PHOTO_HINT = 'Obligatoria · sacá una foto con la cámara';
export const DRIVER_PROFILE_PHOTO_REQUIRED_MSG =
  'Sacá una foto de perfil con la cámara para continuar.';
export const DRIVER_PROFILE_PHOTO_PERMISSION_MSG =
  'Necesitamos acceso a la cámara para tu foto de perfil.';
export const DRIVER_PROFILE_PHOTO_UPLOAD_FAIL_MSG =
  'No se pudo subir la foto de perfil. Intentá de nuevo.';
