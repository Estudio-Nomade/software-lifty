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

/**
 * Single post-auth destination — skip Welcome BrandSplash hop.
 * Never return `/` (guest Welcome) when we have a userId: profile API
 * unknown → complete-profile (safe; user can finish ficha or leave if already ok).
 */
export async function resolvePassengerPostAuthPath(
  userId: string | null,
): Promise<PassengerPostAuthPath> {
  const complete = await resolvePassengerProfileComplete(userId);
  if (complete === false) return '/complete-profile';
  // Network/unknown: prefer complete-profile over guest CTAs (OAuth bounce fix).
  if (complete === null) return userId ? '/complete-profile' : '/';
  if (await needsLocationPermissionPrompt()) return '/location-permissions';
  return '/home';
}

/** Retry profile resolve a few times before accepting the safe fallback. */
export async function resolvePassengerPostAuthPathWithRetry(
  userId: string | null,
  opts?: { attempts?: number; delayMs?: number },
): Promise<PassengerPostAuthPath> {
  const attempts = opts?.attempts ?? 3;
  const delayMs = opts?.delayMs ?? 400;
  let last: PassengerPostAuthPath = userId ? '/complete-profile' : '/';
  for (let i = 0; i < attempts; i++) {
    last = await resolvePassengerPostAuthPath(userId);
    // Re-check only when path came from unknown complete (we cannot distinguish
    // complete-profile-from-false vs null after resolve). Re-resolve profile:
    if (last !== '/complete-profile' || !userId) return last;
    const complete = await resolvePassengerProfileComplete(userId);
    if (complete === true) {
      if (await needsLocationPermissionPrompt()) return '/location-permissions';
      return '/home';
    }
    if (complete === false) return '/complete-profile';
    // still null — brief wait and retry
    if (i < attempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  return last;
}
