/** Parse OAuth redirect URL query/hash without Expo deps (unit-testable). */
export function getAuthQueryParams(url: string): {
  params: Record<string, string>;
  errorCode: string | null;
} {
  const params: Record<string, string> = {};
  const match = url.match(/[?#](.*)/);
  if (!match) return { params, errorCode: null };

  const queryString = match[1];
  queryString.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  });

  return { params, errorCode: params.error ?? null };
}
