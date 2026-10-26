/**
 * ANSV Licencia Nacional — motos 2 ruedas = subclases A 1.x
 * https://www.argentina.gob.ar/seguridadvial/licencianacional/clasesysubclases
 *
 * Lifty product floor: engine_cc ≥ 150 → A1.1 (≤50) out; A1.2 only at 150 cc.
 * A2/A3 oficiales = cuatriciclos — not accepted as moto 2-wheel class.
 */
import { AppError } from './errors';
import { MOTO_MIN_ENGINE_CC } from './vehicle-engine-cc';

export const MOTO_LICENSE_CATEGORIES = ['A1.2', 'A1.3', 'A1.4'] as const;
export type MotoLicenseCategory = (typeof MOTO_LICENSE_CATEGORIES)[number];

/** UI / copy ranges (inclusive). */
export const MOTO_LICENSE_CC_RANGES: Record<
  MotoLicenseCategory,
  { min: number; max: number | null; label: string }
> = {
  'A1.2': { min: MOTO_MIN_ENGINE_CC, max: 150, label: 'hasta 150 cc' },
  'A1.3': { min: 151, max: 300, label: '151–300 cc' },
  'A1.4': { min: 301, max: null, label: 'más de 300 cc' },
};

/**
 * Normalize free-text category from client/DB to canonical A1.2 | A1.3 | A1.4 | other upper token.
 * Accepts: a1.2, A1.2, A 1.2, A.1.2, A1-2, etc.
 */
export function normalizeMotoLicenseCategory(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';

  // A1.2 / A.1.2 / A1-2 / A12 (ambiguous — only accept dotted or explicit)
  const m = s.match(/^A\.?1[.\-]?([234])$/);
  if (m) return `A1.${m[1]}` as MotoLicenseCategory;

  // Already canonical
  if ((MOTO_LICENSE_CATEGORIES as readonly string[]).includes(s)) return s;

  // Legacy mistaken chips A2/A3/A4 from early Lifty build — map to ANSV A1.x
  if (s === 'A2') return 'A1.2';
  if (s === 'A3') return 'A1.3';
  if (s === 'A4') return 'A1.4';

  return s;
}

export function isAllowedMotoLicenseCategory(raw: string | null | undefined): boolean {
  const cat = normalizeMotoLicenseCategory(raw);
  return (MOTO_LICENSE_CATEGORIES as readonly string[]).includes(cat);
}

export function motoLicenseCategoryForEngineCc(cc: number): MotoLicenseCategory | null {
  if (!Number.isInteger(cc) || cc < MOTO_MIN_ENGINE_CC) return null;
  if (cc <= 150) return 'A1.2';
  if (cc <= 300) return 'A1.3';
  return 'A1.4';
}

/** True when declared class can legally cover this displacement (Lifty floor applied). */
export function motoLicenseMatchesEngineCc(
  categoryRaw: string | null | undefined,
  engineCc: number | null | undefined,
): boolean {
  if (engineCc == null || !Number.isInteger(engineCc)) return false;
  if (!isAllowedMotoLicenseCategory(categoryRaw)) return false;
  const cat = normalizeMotoLicenseCategory(categoryRaw) as MotoLicenseCategory;
  const range = MOTO_LICENSE_CC_RANGES[cat];
  if (engineCc < range.min) return false;
  if (range.max != null && engineCc > range.max) return false;
  return true;
}

export function assertMotoLicenseMatchesEngineCc(
  categoryRaw: string | null | undefined,
  engineCc: number | null | undefined,
): MotoLicenseCategory {
  const cat = normalizeMotoLicenseCategory(categoryRaw);
  if (!isAllowedMotoLicenseCategory(cat)) {
    throw new AppError(
      'Para moto la clase de licencia debe ser A1.2, A1.3 o A1.4 (ANSV). A1.1 (≤50 cc) no aplica en Lifty.',
      400,
      'LICENSE_CATEGORY_INVALID',
    );
  }
  const canonical = cat as MotoLicenseCategory;
  if (engineCc == null || !Number.isInteger(engineCc)) {
    throw new AppError(
      'Indicá la cilindrada (cc) de la moto para validar la clase de licencia.',
      400,
      'VEHICLE_ENGINE_CC_INVALID',
    );
  }
  if (!motoLicenseMatchesEngineCc(canonical, engineCc)) {
    const range = MOTO_LICENSE_CC_RANGES[canonical];
    const rangeTxt = range.max == null ? `≥ ${range.min} cc` : `${range.min}–${range.max} cc`;
    const suggested = motoLicenseCategoryForEngineCc(engineCc);
    throw new AppError(
      suggested
        ? `La clase ${canonical} habilita motos de ${rangeTxt}. Tu cédula indica ${engineCc} cc → corresponde ${suggested}.`
        : `La clase ${canonical} no coincide con ${engineCc} cc.`,
      400,
      'LICENSE_CATEGORY_CC_MISMATCH',
    );
  }
  return canonical;
}
