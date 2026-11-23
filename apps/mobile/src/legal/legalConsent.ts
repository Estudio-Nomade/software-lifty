import { apiClient } from '../api/client';
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
  await apiClient.post('/auth/legal-accept', {
    terms_version: GENERAL_TERMS_VERSION,
    privacy_version: PRIVACY_POLICY_VERSION,
  });
}
