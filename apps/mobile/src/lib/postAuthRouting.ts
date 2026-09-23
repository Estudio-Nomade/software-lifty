import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { ApiError, driverStatusSchema } from '../api/types';
import type { ScreenName } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';

/** Network / CORS / timeout — do not invent pending onboarding. */
export function isTransientStatusFailure(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.code === 'NETWORK_ERROR' || err.status === 0;
  }
  return false;
}

type DriverStatusValue = DriverStatus['status'] | null;

export interface StepRoute {
  screen: ScreenName;
  storeStatus: DriverStatusValue;
}

// Single source of truth for "given the backend onboarding step, which screen".
// The flow is KYC-gated end to end:
//   profile → kyc → vehicle → documents → review → approved
// Everything routes off `step` so a driver can never skip the KYC screen by
// closing and reopening the app.
export const STEP_ROUTE: Record<string, StepRoute> = {
  profile: { screen: 'OnboardingStep1', storeStatus: 'pending' },
  kyc: { screen: 'KYCVerify', storeStatus: 'pending' },
  vehicle: { screen: 'OnboardingVehicle', storeStatus: 'pending' },
  documents: { screen: 'OnboardingStep2', storeStatus: 'pending' },
  // Review lands on the map-first home (Active). Connect stays blocked until approved.
  review: { screen: 'Active', storeStatus: 'under_review' },
  approved: { screen: 'Active', storeStatus: 'approved' },
};

/**
 * Resolves the target screen for a parsed driver status. Terminal account
 * states (rejected / suspended) short-circuit; otherwise we route by `step`,
 * falling back to the KYC-aware `status` and finally the onboarding entry.
 */
export function routeForDriverStatus(driverData: DriverStatus): {
  screen: ScreenName | '';
  status: DriverStatusValue;
  blockedMessage?: string;
} {
  const { status, step } = driverData;

  if (status === 'rejected') {
    return {
      screen: '',
      status,
      blockedMessage: 'Tu cuenta ha sido rechazada. Contacta a soporte.',
    };
  }
  if (status === 'suspended') {
    return { screen: '', status, blockedMessage: 'Tu cuenta ha sido suspendida.' };
  }

  const byStep = step ? STEP_ROUTE[step] : undefined;
  if (byStep) {
    return { screen: byStep.screen, status: byStep.storeStatus };
  }

  if (status === 'approved') {
    return { screen: 'Active', status: 'approved' };
  }
  if (status === 'under_review') return { screen: 'Active', status: 'under_review' };

  return { screen: 'OnboardingStep1', status: 'pending' };
}

export interface PostAuthRoute {
  /** Target screen name (empty string when the account is blocked). */
  screen: ScreenName | '';
  status: DriverStatusValue;
  /** Present when the account cannot proceed (rejected / suspended). */
  blockedMessage?: string;
}

/**
 * Resolves where a freshly-authenticated user goes next.
 *
 * Hitting `/drivers/me/status` also triggers backend profile creation: the auth
 * middleware upserts the `users` row keyed by the Supabase user id, so a new
 * user gets a profile automatically (no duplicates) and is routed into the
 * onboarding flow. Existing users are routed straight to their current stage.
 */
export async function resolvePostAuthRoute(): Promise<PostAuthRoute> {
  try {
    const { data: body } = await apiClient.get('/drivers/me/status');
    const payload = body?.data ?? body;
    const parsed = driverStatusSchema.safeParse(payload);
    const driverData = parsed.success ? parsed.data : (payload as DriverStatus);

    if (driverData.status) {
      useAuthStore.getState().setDriverStatus(driverData.status);
    }
    if (driverData.step != null) {
      useAuthStore.getState().setOnboardingStep(driverData.step);
    }

    return routeForDriverStatus(driverData);
  } catch (err) {
    // CORS / offline / API down: leave status null so welcome can recover.
    // Do not invent pending → OnboardingStep1 (that screen then fails too).
    if (isTransientStatusFailure(err)) {
      throw err;
    }
    // Non-network failure after auth (e.g. empty profile) — onboarding entry.
    useAuthStore.getState().setDriverStatus('pending');
    return { screen: 'OnboardingStep1', status: 'pending' };
  }
}
