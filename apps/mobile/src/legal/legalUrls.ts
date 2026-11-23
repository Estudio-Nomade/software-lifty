/** Public legal pages — host SoT: https://web.liftyviajes.com (web-Lifty). */
export const LEGAL_SITE_ORIGIN = 'https://web.liftyviajes.com' as const;
export const PRIVACY_POLICY_URL = `${LEGAL_SITE_ORIGIN}/privacidad` as const;
export const TERMS_URL = `${LEGAL_SITE_ORIGIN}/terminos` as const;

/** Lockstep with passenger app — bump only when privacy text changes. */
export const PRIVACY_POLICY_VERSION = '1.0.0' as const;

export const PRIVACY_POLICY_LABEL = 'Política de Privacidad';
export const TERMS_FULL_LABEL = 'Términos y condiciones (completo)';
