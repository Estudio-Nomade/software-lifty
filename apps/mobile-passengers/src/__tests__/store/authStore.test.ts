import { useAuthStore } from '../../store/authStore';

function resetStore() {
  useAuthStore.setState({
    token: null,
    userId: null,
    isAuthenticated: false,
    needsRedirect: false,
    sessionRestored: true,
    email: null,
    fullName: null,
  });
}

describe('authStore.setSession identity replace', () => {
  beforeEach(() => {
    resetStore();
  });

  it('replaces email and userId when switching accounts', () => {
    useAuthStore
      .getState()
      .setSession('token-b', 'user-b', 'estudio@example.com', 'Estudio Nomade');

    useAuthStore
      .getState()
      .setSession('token-a', 'user-a', 'martinayaquinta@example.com', null);

    const state = useAuthStore.getState();
    expect(state.userId).toBe('user-a');
    expect(state.email).toBe('martinayaquinta@example.com');
    expect(state.fullName).toBeNull();
    expect(state.token).toBe('token-a');
    expect(state.isAuthenticated).toBe(true);
  });

  it('does not keep previous fullName when new session omits name', () => {
    useAuthStore.getState().setSession('t1', 'u1', 'a@x.com', 'Old Name');
    // 3-arg call: fullName omitted (undefined) + new userId → clear sticky name
    useAuthStore.getState().setSession('t2', 'u2', 'b@x.com');

    const state = useAuthStore.getState();
    expect(state.userId).toBe('u2');
    expect(state.email).toBe('b@x.com');
    expect(state.fullName).toBeNull();
  });

  it('clearAuthLocal drops identity without arming redirect', () => {
    useAuthStore.getState().setSession('token', 'user-b', 'b@x.com', 'B');
    useAuthStore.getState().clearAuthLocal();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.email).toBeNull();
    expect(state.fullName).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.needsRedirect).toBe(false);
  });

  it('clearAuth arms redirect only when previously authenticated', () => {
    useAuthStore.getState().setSession('token', 'user-b', 'b@x.com', 'B');
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().needsRedirect).toBe(true);

    useAuthStore.getState().resetRedirect();
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().needsRedirect).toBe(false);
  });
});
