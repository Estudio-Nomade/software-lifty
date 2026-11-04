import { getProfile, registerPassenger } from '../api/passenger';
import {
  isPassengerProfileComplete,
  readPassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from './passengerProfileGate';

/**
 * Same gate AuthRedirectWatcher uses: incomplete ficha → CompleteProfile (#480).
 */
export async function resolvePassengerProfileComplete(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const cached = readPassengerProfileCompleteCache(userId);
  if (cached !== null) return cached;

  try {
    let profile = await getProfile().catch(() => null);
    if (!profile) {
      await registerPassenger().catch(() => null);
      profile = await getProfile().catch(() => null);
    }
    const complete = profile ? isPassengerProfileComplete(profile) : false;
    writePassengerProfileCompleteCache(userId, complete);
    return complete;
  } catch {
    writePassengerProfileCompleteCache(userId, false);
    return false;
  }
}

/** Single post-OAuth destination — skip Welcome BrandSplash hop. */
export async function resolvePassengerPostAuthPath(
  userId: string | null,
): Promise<'/complete-profile' | '/home'> {
  const complete = await resolvePassengerProfileComplete(userId);
  return complete ? '/home' : '/complete-profile';
}
