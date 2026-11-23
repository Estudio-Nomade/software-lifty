import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { GENERAL_TERMS_VERSION } from './generalTermsSummary';
import { PRIVACY_POLICY_VERSION } from './legalUrls';

export type LegalPayload = {
  terms_version?: string | null;
  privacy_version?: string | null;
  terms_accepted_at?: string | null;
};

export function isCurrentLegalAccepted(legal?: LegalPayload | null): boolean {
  if (!legal) return false;
  return (
    legal.terms_version === GENERAL_TERMS_VERSION &&
    legal.privacy_version === PRIVACY_POLICY_VERSION
  );
}

export async function postLegalAccept(): Promise<void> {
  await api.post('/auth/legal-accept', {
    terms_version: GENERAL_TERMS_VERSION,
    privacy_version: PRIVACY_POLICY_VERSION,
  });
}

/** Source of truth: GET /auth/me → termsAccepted store. Soft-fail keeps prior flag. */
export async function hydrateLegalConsentFromMe(): Promise<boolean> {
  try {
    const { data } = await api.get<{ legal?: LegalPayload }>('/auth/me');
    const ok = isCurrentLegalAccepted(data?.legal ?? null);
    useAuthStore.getState().setTermsAccepted(ok);
    return ok;
  } catch {
    return useAuthStore.getState().termsAccepted;
  }
}
