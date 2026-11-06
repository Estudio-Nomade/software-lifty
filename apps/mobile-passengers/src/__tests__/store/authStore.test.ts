import { mergePassengerAuthPersist, useAuthStore } from '../../store/authStore';

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

function baseState(): ReturnType<typeof useAuthStore.getState> {
  return {
    ...useAuthStore.getState(),
    token: null,
    userId: null,
    email: null,
    fullName: null,
    isAuthenticated: false,
    needsRedirect: false,
    sessionRestored: false,
  };
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

describe('mergePassengerAuthPersist', () => {
  it('keeps live identity when current already has token+userId', () => {
    const current = {
      ...baseState(),
      token: 'live-a',
      userId: 'user-a',
      email: 'a@x.com',
      fullName: null,
      isAuthenticated: true,
    };
    const merged = mergePassengerAuthPersist(
      {
        token: 'tok-b',
        userId: 'user-b',
        email: 'b@x.com',
        fullName: 'Estudio',
        isAuthenticated: true,
      },
      current,
    );
    expect(merged.token).toBe('live-a');
    expect(merged.userId).toBe('user-a');
    expect(merged.email).toBe('a@x.com');
    expect(merged.fullName).toBe('Estudio');
    expect(merged.isAuthenticated).toBe(true);
  });

  it('forces isAuthenticated from token on cold hydrate', () => {
    const current = baseState();
    const withToken = mergePassengerAuthPersist(
      {
        token: 'tok-b',
        userId: 'user-b',
        email: 'b@x.com',
        fullName: 'Estudio',
        isAuthenticated: true,
      },
      current,
    );
    expect(withToken.token).toBe('tok-b');
    expect(withToken.userId).toBe('user-b');
    expect(withToken.isAuthenticated).toBe(true);

    const stickyTrueNoToken = mergePassengerAuthPersist(
      {
        token: null,
        userId: 'user-b',
        email: 'b@x.com',
        fullName: 'Estudio',
        isAuthenticated: true,
      },
      current,
    );
    expect(stickyTrueNoToken.token).toBeNull();
    expect(stickyTrueNoToken.isAuthenticated).toBe(false);
  });
});
