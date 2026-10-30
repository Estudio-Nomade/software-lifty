export type NameParts = { firstName: string; lastName: string };

const MIN_NAME_LEN = 2;
const MIN_PHONE_DIGITS = 8;

/** Module cache so watchers don't hammer getProfile. Cleared on logout / submit. */
let profileCompleteCache: { userId: string; complete: boolean } | null = null;

export function invalidatePassengerProfileCompleteCache(): void {
  profileCompleteCache = null;
}

export function readPassengerProfileCompleteCache(userId: string): boolean | null {
  if (profileCompleteCache?.userId !== userId) return null;
  return profileCompleteCache.complete;
}

export function writePassengerProfileCompleteCache(userId: string, complete: boolean): void {
  profileCompleteCache = { userId, complete };
}

export function splitGoogleName(
  meta:
    | {
        given_name?: string;
        family_name?: string;
        full_name?: string;
        name?: string;
      }
    | null
    | undefined,
): NameParts {
  if (!meta) return { firstName: '', lastName: '' };

  const given = typeof meta.given_name === 'string' ? meta.given_name.trim() : '';
  const family = typeof meta.family_name === 'string' ? meta.family_name.trim() : '';
  if (given || family) {
    return { firstName: given, lastName: family };
  }

  const raw =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    '';
  if (!raw) return { firstName: '', lastName: '' };

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: '' };
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export function joinFullName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(' ');
}

export function phoneDigitCount(phone: string | null | undefined): number {
  if (!phone) return 0;
  return phone.replace(/\D/g, '').length;
}

export function isPassengerPhoneComplete(phone: string | null | undefined): boolean {
  return phoneDigitCount(phone) >= MIN_PHONE_DIGITS;
}

/** complete = usable full_name AND phone with enough digits */
export function isPassengerProfileComplete(profile: {
  full_name?: string | null;
  phone?: string | null;
}): boolean {
  const name = profile.full_name?.trim() ?? '';
  return name.length >= MIN_NAME_LEN && isPassengerPhoneComplete(profile.phone);
}
