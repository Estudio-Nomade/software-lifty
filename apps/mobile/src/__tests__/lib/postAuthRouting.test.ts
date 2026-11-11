import { ApiError } from '../../api/types';
import {
  STEP_ROUTE,
  isAuthStatusFailure,
  isTransientStatusFailure,
  routeForDriverStatus,
  shouldLeaveDriverStatusUnresolved,
} from '../../lib/postAuthRouting';
import { SCREEN_TO_ROUTE, routePathForScreen } from '../../lib/screenRoutes';

describe('STEP_ROUTE order', () => {
  it('keeps KYC before vehicle before documents', () => {
    expect(STEP_ROUTE.profile.screen).toBe('OnboardingStep1');
    expect(STEP_ROUTE.kyc.screen).toBe('KYCVerify');
    expect(STEP_ROUTE.vehicle.screen).toBe('OnboardingVehicle');
    expect(STEP_ROUTE.documents.screen).toBe('OnboardingStep2');
  });

  it('sends review to Active map home', () => {
    expect(STEP_ROUTE.review.screen).toBe('Active');
    expect(STEP_ROUTE.review.storeStatus).toBe('under_review');
  });
});

describe('routeForDriverStatus', () => {
  it('routes vehicle step to OnboardingVehicle once', () => {
    const r = routeForDriverStatus({ status: 'pending', step: 'vehicle' });
    expect(r.screen).toBe('OnboardingVehicle');
  });

  it('routes documents step away from vehicle (no duplicate form)', () => {
    const r = routeForDriverStatus({ status: 'pending', step: 'documents' });
    expect(r.screen).toBe('OnboardingStep2');
    expect(r.screen).not.toBe('OnboardingVehicle');
  });

  it('routes kyc step to KYCVerify (not vehicle)', () => {
    const r = routeForDriverStatus({ status: 'pending', step: 'kyc' });
    expect(r.screen).toBe('KYCVerify');
  });

  it('routes approved drivers with district to Active home', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      step: 'approved',
      has_district: true,
    });
    expect(r.screen).toBe('Active');
  });

  it('routes approved drivers without district to Active (picker on GO)', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      step: 'approved',
      has_district: false,
    });
    expect(r.screen).toBe('Active');
    expect(r.screen).not.toBe('SelectProvince');
  });

  it('routes approved status without step and without district to Active', () => {
    const r = routeForDriverStatus({
      status: 'approved',
      has_district: false,
    });
    expect(r.screen).toBe('Active');
  });

  it('routes review step to Active (map home while awaiting approval)', () => {
    const r = routeForDriverStatus({
      status: 'under_review',
      step: 'review',
    });
    expect(r.screen).toBe('Active');
    expect(r.status).toBe('under_review');
  });

  it('routes under_review status without step to Active', () => {
    const r = routeForDriverStatus({ status: 'under_review' });
    expect(r.screen).toBe('Active');
    expect(r.status).toBe('under_review');
  });

  it('routes rejected to OnboardingStep2 reupload (not blocked empty screen)', () => {
    const r = routeForDriverStatus({
      status: 'rejected',
      step: 'review',
      admin_review_notes: 'Licencia ilegible',
    });
    expect(r.screen).toBe('OnboardingStep2');
    expect(r.status).toBe('rejected');
    expect(r.blockedMessage).toContain('Licencia ilegible');
  });

  it('rejected without notes uses partial-fix copy', () => {
    const r = routeForDriverStatus({ status: 'rejected', step: 'documents' });
    expect(r.screen).toBe('OnboardingStep2');
    expect(r.blockedMessage).toContain('Solo volvé a subir lo indicado');
  });
});

describe('routePathForScreen (post-OAuth replace target)', () => {
  it('maps post-auth screens to pathnames (no Welcome hop)', () => {
    expect(routePathForScreen('Active')).toBe('/active');
    expect(routePathForScreen('OnboardingStep1')).toBe('/onboarding-step1');
    expect(routePathForScreen('KYCVerify')).toBe('/kyc-verify');
    expect(routePathForScreen('OnboardingVehicle')).toBe('/onboarding-vehicle');
    expect(routePathForScreen('OnboardingStep2')).toBe('/onboarding-step2');
  });

  it('falls back to Welcome path only when screen is empty', () => {
    expect(routePathForScreen('')).toBe('/');
  });

  it('never maps approved/review status routes through Welcome guest', () => {
    const approved = routeForDriverStatus({ status: 'approved', step: 'approved' });
    expect(routePathForScreen(approved.screen)).toBe('/active');
    expect(routePathForScreen(approved.screen)).not.toBe('/');
  });
});

describe('isTransientStatusFailure', () => {
  it('treats network / timeout ApiErrors as transient (do not invent pending)', () => {
    expect(
      isTransientStatusFailure(
        new ApiError({
          error: {
            code: 'NETWORK_ERROR',
            message: 'Sin conexion.',
            status: 0,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      ),
    ).toBe(true);
    expect(
      isTransientStatusFailure(
        new ApiError({
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'timeout',
            status: 0,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      ),
    ).toBe(true);
  });

  it('does not treat validation / business errors as transient', () => {
    expect(
      isTransientStatusFailure(
        new ApiError({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'bad',
            status: 400,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      ),
    ).toBe(false);
    expect(isTransientStatusFailure(new Error('boom'))).toBe(false);
  });

  it('does not treat 401 as network-transient (sign-out paths stay gated)', () => {
    expect(
      isTransientStatusFailure(
        new ApiError({
          error: {
            code: 'TOKEN_REQUIRED',
            message: 'Se requiere iniciar sesión.',
            status: 401,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      ),
    ).toBe(false);
  });
});

describe('isAuthStatusFailure / shouldLeaveDriverStatusUnresolved', () => {
  it('flags TOKEN_* / 401 as auth status failure', () => {
    const err = new ApiError({
      error: {
        code: 'TOKEN_REQUIRED',
        message: 'Se requiere iniciar sesión.',
        status: 401,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    expect(isAuthStatusFailure(err)).toBe(true);
    expect(shouldLeaveDriverStatusUnresolved(err)).toBe(true);
  });

  it('leaves status unresolved for network too', () => {
    const err = new ApiError({
      error: {
        code: 'NETWORK_ERROR',
        message: 'Sin conexion.',
        status: 0,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    expect(shouldLeaveDriverStatusUnresolved(err)).toBe(true);
  });

  it('does not leave unresolved for plain validation errors', () => {
    const err = new ApiError({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        status: 400,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    expect(isAuthStatusFailure(err)).toBe(false);
    expect(shouldLeaveDriverStatusUnresolved(err)).toBe(false);
  });
});

describe('dual-role (existing passenger opening the driver app)', () => {
  it('goes straight to onboarding profile (no intermediate notice screen)', () => {
    const r = routeForDriverStatus({
      status: 'pending',
      step: 'profile',
      has_passenger_profile: true,
    });
    expect(r.screen).toBe('OnboardingStep1');
    expect(r.status).toBe('pending');
  });

  it('goes straight to onboarding for a brand-new user', () => {
    const r = routeForDriverStatus({
      status: 'pending',
      step: 'profile',
      has_passenger_profile: false,
    });
    expect(r.screen).toBe('OnboardingStep1');
  });

  it('does not divert once onboarding is past the profile step', () => {
    const r = routeForDriverStatus({
      status: 'pending',
      step: 'kyc',
      has_passenger_profile: true,
    });
    expect(r.screen).toBe('KYCVerify');
  });

  it('still registers the legacy notice route path (deep links / unused screen)', () => {
    expect(routePathForScreen('PassengerAccountNotice')).toBe('/passenger-account-notice');
  });

  it('SCREEN_TO_ROUTE does not index path strings (useAppNavigation no-op trap)', () => {
    expect(SCREEN_TO_ROUTE['/passenger-account-notice' as keyof typeof SCREEN_TO_ROUTE]).toBeUndefined();
    expect(SCREEN_TO_ROUTE.PassengerAccountNotice).toBe('/passenger-account-notice');
  });
});
