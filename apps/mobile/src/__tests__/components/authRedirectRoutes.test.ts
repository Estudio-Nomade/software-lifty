import { isAllowedWithoutSession } from '../../lib/authRouteGate';

describe('unauthenticated route gate', () => {
  it('allows welcome and auth entry screens', () => {
    expect(isAllowedWithoutSession('')).toBe(true);
    expect(isAllowedWithoutSession('login-credentials')).toBe(true);
    expect(isAllowedWithoutSession('register')).toBe(true);
    expect(isAllowedWithoutSession('forgot-password')).toBe(true);
    expect(isAllowedWithoutSession('terms')).toBe(true);
    expect(isAllowedWithoutSession('login-otp')).toBe(true);
  });

  it('blocks onboarding and app home without a session', () => {
    expect(isAllowedWithoutSession('onboarding-step1')).toBe(false);
    expect(isAllowedWithoutSession('onboarding-step2')).toBe(false);
    expect(isAllowedWithoutSession('onboarding-vehicle')).toBe(false);
    expect(isAllowedWithoutSession('active')).toBe(false);
    expect(isAllowedWithoutSession('profile')).toBe(false);
    expect(isAllowedWithoutSession('kyc-verify')).toBe(false);
    expect(isAllowedWithoutSession('waiting-approval')).toBe(false);
  });
});

describe('authenticated step-gate expectations', () => {
  it('documents that onboarding-step1 is not a public entry (must be corrected by watcher)', () => {
    // AuthRedirectWatcher STEP_GATED_ROUTES includes onboarding-step1;
    // approved + that segment → replace /active (covered in session-restore tests).
    expect(isAllowedWithoutSession('onboarding-step1')).toBe(false);
  });
});
