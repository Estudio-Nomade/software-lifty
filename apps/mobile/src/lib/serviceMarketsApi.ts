import { apiClient } from '../api/client';

/** GET /service-markets/active raw body (auth via apiClient interceptor). */
export async function fetchActiveServiceMarketsPayload(): Promise<unknown> {
  const { data } = await apiClient.get<unknown>('/service-markets/active');
  return data;
}
