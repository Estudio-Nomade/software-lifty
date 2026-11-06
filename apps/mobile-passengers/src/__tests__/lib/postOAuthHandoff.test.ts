import {
  OAUTH_HANDOFF_ABORTED,
  WELCOME_HOP_REFUSED,
  beginOAuthBrandBridge,
  endOAuthBrandBridge,
  getLastOAuthHandoffTarget,
  isOAuthBrandBridgeActive,
  isPostOAuthHandoffCompleted,
  resetPostOAuthHandoff,
  resetPostOAuthHandoffForTests,
  runPostOAuthHandoff,
} from '../../lib/postOAuthHandoff';

describe('runPostOAuthHandoff', () => {
  beforeEach(() => {
    resetPostOAuthHandoffForTests();
  });

  it('navigates once for a key and turns brand bridge on', async () => {
    const navigate = jest.fn();
    const resolveTarget = jest.fn().mockResolvedValue('/home');

    const result = await runPostOAuthHandoff({
      key: 'user-1',
      owner: 'AuthCallback',
      resolveTarget,
      navigate,
    });

    expect(result).toBe('navigated');
    expect(resolveTarget).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(isPostOAuthHandoffCompleted('user-1')).toBe(true);
    expect(getLastOAuthHandoffTarget()).toBe('/home');
    expect(isOAuthBrandBridgeActive()).toBe(true);
    endOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(false);
  });

  it('beginOAuthBrandBridge is idempotent single visual', () => {
    beginOAuthBrandBridge();
    beginOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(true);
    endOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(false);
  });

  it('second call same key is no-op (skipped)', async () => {
    const navigate = jest.fn();
    await runPostOAuthHandoff({
      key: 'user-1',
      owner: 'AuthCallback',
      resolveTarget: async () => '/home',
      navigate,
    });
    navigate.mockClear();

    const result = await runPostOAuthHandoff({
      key: 'user-1',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/complete-profile',
      navigate,
    });

    expect(result).toBe('skipped');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('concurrent callers join single navigate', async () => {
    const navigate = jest.fn();
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });

    const a = runPostOAuthHandoff({
      key: 'user-2',
      owner: 'AuthCallback',
      resolveTarget: () => gate,
      navigate,
    });
    const b = runPostOAuthHandoff({
      key: 'user-2',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/wrong',
      navigate,
    });

    release('/home');
    const [ra, rb] = await Promise.all([a, b]);

    expect(new Set([ra, rb])).toEqual(new Set(['navigated', 'joined']));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('reset invalidates stale inflight — old work does not navigate or complete', async () => {
    const navigate = jest.fn();
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });

    const stale = runPostOAuthHandoff({
      key: 'user-3',
      owner: 'AuthCallback',
      resolveTarget: () => gate,
      navigate,
    });

    resetPostOAuthHandoff();
    release('/home');

    await expect(stale).rejects.toThrow(OAUTH_HANDOFF_ABORTED);
    expect(navigate).not.toHaveBeenCalled();
    expect(isPostOAuthHandoffCompleted('user-3')).toBe(false);

    const freshNav = jest.fn();
    const result = await runPostOAuthHandoff({
      key: 'user-3',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/complete-profile',
      navigate: freshNav,
    });
    expect(result).toBe('navigated');
    expect(freshNav).toHaveBeenCalledWith('/complete-profile');
  });

  it('refuses Welcome hop without marking completed', async () => {
    const navigate = jest.fn();
    await expect(
      runPostOAuthHandoff({
        key: 'user-4',
        owner: 'LoginCredentials',
        resolveTarget: async () => 'Welcome',
        navigate,
      }),
    ).rejects.toThrow(WELCOME_HOP_REFUSED);

    expect(navigate).not.toHaveBeenCalled();
    expect(isPostOAuthHandoffCompleted('user-4')).toBe(false);
  });

  it('leader failure propagates to joiner (no silent joined)', async () => {
    const navigate = jest.fn();
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });

    const leader = runPostOAuthHandoff({
      key: 'user-5',
      owner: 'AuthCallback',
      resolveTarget: () => gate,
      navigate,
    });
    const joiner = runPostOAuthHandoff({
      key: 'user-5',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/home',
      navigate,
    });

    release('/'); // forbidden target
    await expect(leader).rejects.toThrow(WELCOME_HOP_REFUSED);
    // Joiner may become leader after failure and succeed with /home
    await expect(joiner).resolves.toBe('navigated');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/home');
  });
});
