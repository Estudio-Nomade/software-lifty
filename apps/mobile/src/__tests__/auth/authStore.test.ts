import { useAuthStore } from '../../store/authStore';

function resetStore() {
  useAuthStore.setState({
    token: null,
    driverId: null,
    isAuthenticated: false,
    needsRedirect: false,
    sessionRestored: true,
    phone: null,
    driverStatus: null,
    onboardingStep: null,
    kycSessionId: null,
    termsAccepted: false,
  });
}

describe('authStore.clearAuth', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not arm a redirect when the user is already signed out', () => {
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().needsRedirect).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('arms a single redirect when transitioning from authenticated to signed-out', () => {
    useAuthStore.getState().setSession('token', 'driver-1');

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().needsRedirect).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    useAuthStore.getState().resetRedirect();
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().needsRedirect).toBe(false);
  });

  it('keeps sessionRestored true after sign-out', () => {
    useAuthStore.getState().setSession('token', 'driver-1');
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().sessionRestored).toBe(true);
  });

  it('clears driver status and onboarding step on sign-out', () => {
    useAuthStore.getState().setSession('token', 'driver-1');
    useAuthStore.setState({ driverStatus: 'approved', onboardingStep: 'approved' });

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().driverStatus).toBeNull();
    expect(useAuthStore.getState().onboardingStep).toBeNull();
  });
});

describe('authStore.clearAuthState', () => {
  beforeEach(() => {
    resetStore();
  });

  it('clears auth state without arming a redirect', () => {
    useAuthStore.getState().setSession('token', 'driver-1');
    useAuthStore.setState({ driverStatus: 'approved', onboardingStep: 'approved' });

    useAuthStore.getState().clearAuthState();

    expect(useAuthStore.getState().needsRedirect).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().driverStatus).toBeNull();
    expect(useAuthStore.getState().onboardingStep).toBeNull();
  });
});
