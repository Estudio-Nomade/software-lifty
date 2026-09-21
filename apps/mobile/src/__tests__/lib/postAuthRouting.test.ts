import { STEP_ROUTE, routeForDriverStatus, targetScreenFromStore } from '../../lib/postAuthRouting';

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
});

describe('targetScreenFromStore', () => {
  it('uses STEP_ROUTE when onboardingStep is set', () => {
    expect(targetScreenFromStore('approved', 'approved')).toBe('Active');
    expect(targetScreenFromStore('profile', 'pending')).toBe('OnboardingStep1');
    expect(targetScreenFromStore('vehicle', 'pending')).toBe('OnboardingVehicle');
  });

  it('falls back to status when step is null', () => {
    expect(targetScreenFromStore(null, 'approved')).toBe('Active');
    expect(targetScreenFromStore(null, 'pending')).toBe('OnboardingStep1');
  });
});
