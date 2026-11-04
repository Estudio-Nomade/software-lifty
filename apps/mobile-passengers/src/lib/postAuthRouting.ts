import { getProfile, registerPassenger } from '../api/passenger';
import {
  isPassengerProfileComplete,
  readPassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from './passengerProfileGate';

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

/** Single post-OAuth destination — skip Welcome BrandSplash hop. */
export async function resolvePassengerPostAuthPath(
  userId: string | null,
): Promise<'/complete-profile' | '/home' | '/'> {
  const complete = await resolvePassengerProfileComplete(userId);
  if (complete === true) return '/home';
  if (complete === false) return '/complete-profile';
  // Unknown (transient): Welcome recovery; watcher retries when profile is reachable.
  return '/';
}
