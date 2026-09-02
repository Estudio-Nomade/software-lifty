import { STEP_ROUTE, routeForDriverStatus } from '../../lib/postAuthRouting';

describe('STEP_ROUTE order', () => {
  it('keeps KYC before vehicle before documents', () => {
    expect(STEP_ROUTE.profile.screen).toBe('OnboardingStep1');
    expect(STEP_ROUTE.kyc.screen).toBe('KYCVerify');
    expect(STEP_ROUTE.vehicle.screen).toBe('OnboardingVehicle');
    expect(STEP_ROUTE.documents.screen).toBe('OnboardingStep2');
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
});
