import { getProfile, registerPassenger } from '../api/passenger';
import { needsLocationPermissionPrompt } from './locationPrompt';
import {
  isPassengerProfileComplete,
  readPassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from './passengerProfileGate';

export type PassengerPostAuthPath = '/complete-profile' | '/location-permissions' | '/home' | '/';

/**
 * Same gate AuthRedirectWatcher uses: incomplete ficha → CompleteProfile (#480).
 * `null` = unknown (network / unexpected) — do not treat as incomplete and do not cache.
 */
export async function resolvePassengerProfileComplete(
  userId: string | null,
): Promise<boolean | null> {
  if (!userId) return false;
  const cached = readPassengerProfileCompleteCache(userId);
  if (cached !== null) return cached;

  try {
    let profile = null as Awaited<ReturnType<typeof getProfile>> | null;
    let lastFetchFailed = false;

    try {
      profile = await getProfile();
    } catch {
      lastFetchFailed = true;
      profile = null;
    }

    if (!profile) {
      await registerPassenger().catch(() => null);
      try {
        profile = await getProfile();
        lastFetchFailed = false;
      } catch {
        lastFetchFailed = true;
        profile = null;
      }
    }

    if (!profile) {
      // Network / API down: unknown. Do not cache incomplete.
      if (lastFetchFailed) return null;
      writePassengerProfileCompleteCache(userId, false);
      return false;
    }

    const complete = isPassengerProfileComplete(profile);
    writePassengerProfileCompleteCache(userId, complete);
    return complete;
  } catch {
    // Unexpected — do not poison cache with false.
    return null;
  }
}

/** Single post-auth destination — skip Welcome BrandSplash hop. */
export async function resolvePassengerPostAuthPath(
  userId: string | null,
): Promise<PassengerPostAuthPath> {
  const complete = await resolvePassengerProfileComplete(userId);
  if (complete === false) return '/complete-profile';
  if (complete === null) return '/';
  if (await needsLocationPermissionPrompt()) return '/location-permissions';
  return '/home';
}
