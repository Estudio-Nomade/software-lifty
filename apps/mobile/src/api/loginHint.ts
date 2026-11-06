import { apiClient } from './client';

export type LoginHintResponse = { googleOnly: boolean };

/** Session-scoped cache: one network hit per email (avoids rate-limit burn on typos). */
const loginHintCache = new Map<string, LoginHintResponse>();

/** Public soft google-only hint after failed password login. Never throws product-critical. */
export async function fetchLoginHint(email: string): Promise<LoginHintResponse | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const cached = loginHintCache.get(key);
  if (cached) return cached;

  try {
    const { data } = await apiClient.post<LoginHintResponse>('/auth/login-hint', { email: key });
    if (!data || typeof data !== 'object' || typeof data.googleOnly !== 'boolean') {
      return null;
    }
    const result: LoginHintResponse = { googleOnly: data.googleOnly };
    loginHintCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
