import {
  HANDOFF_TARGET_NOT_PATH,
  OAUTH_HANDOFF_ABORTED,
  WELCOME_HOP_REFUSED,
  afterPostOAuthHandoff,
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
    const resolveTarget = jest.fn().mockResolvedValue('/active');

    const result = await runPostOAuthHandoff({
      key: 'user-1',
      owner: 'AuthCallback',
      resolveTarget,
      navigate,
    });

    expect(result).toBe('navigated');
    expect(resolveTarget).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/active');
    expect(isPostOAuthHandoffCompleted('user-1')).toBe(true);
    expect(getLastOAuthHandoffTarget()).toBe('/active');
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
      resolveTarget: async () => '/active',
      navigate,
    });
    navigate.mockClear();

    const result = await runPostOAuthHandoff({
      key: 'user-1',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/onboarding-step1',
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

    release('/active');
    const [ra, rb] = await Promise.all([a, b]);

    expect(new Set([ra, rb])).toEqual(new Set(['navigated', 'joined']));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/active');
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
    release('/active');

    await expect(stale).rejects.toThrow(OAUTH_HANDOFF_ABORTED);
    expect(navigate).not.toHaveBeenCalled();
    expect(isPostOAuthHandoffCompleted('user-3')).toBe(false);

    const freshNav = jest.fn();
    const result = await runPostOAuthHandoff({
      key: 'user-3',
      owner: 'LoginCredentials',
      resolveTarget: async () => '/onboarding-step1',
      navigate: freshNav,
    });
    expect(result).toBe('navigated');
    expect(freshNav).toHaveBeenCalledWith('/onboarding-step1');
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

  it('refuses ScreenName targets with distinct HANDOFF_TARGET_NOT_PATH', async () => {
    const navigate = jest.fn();
    await expect(
      runPostOAuthHandoff({
        key: 'user-screen-name',
        owner: 'Register',
        resolveTarget: async () => 'PassengerAccountNotice',
        navigate,
      }),
    ).rejects.toThrow(HANDOFF_TARGET_NOT_PATH);

    expect(navigate).not.toHaveBeenCalled();
    expect(isPostOAuthHandoffCompleted('user-screen-name')).toBe(false);
  });

  it('accepts dual-role notice path', async () => {
    const navigate = jest.fn();
    const result = await runPostOAuthHandoff({
      key: 'user-dual',
      owner: 'AuthCallback',
      resolveTarget: async () => '/passenger-account-notice',
      navigate,
    });
    expect(result).toBe('navigated');
    expect(navigate).toHaveBeenCalledWith('/passenger-account-notice');
    expect(getLastOAuthHandoffTarget()).toBe('/passenger-account-notice');
  });

  it('skipped leaveTo receives path lastTarget (not ScreenName)', async () => {
    const navigate = jest.fn();
    await runPostOAuthHandoff({
      key: 'user-leave',
      owner: 'AuthCallback',
      resolveTarget: async () => '/passenger-account-notice',
      navigate,
    });
    const leave = jest.fn();
    afterPostOAuthHandoff('skipped', leave);
    expect(leave).toHaveBeenCalledWith('/passenger-account-notice');
    endOAuthBrandBridge();
  });

  it('leader failure propagates; joiner can become leader', async () => {
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
      resolveTarget: async () => '/active',
      navigate,
    });

    release('/');
    await expect(leader).rejects.toThrow(WELCOME_HOP_REFUSED);
    await expect(joiner).resolves.toBe('navigated');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/active');
  });

  it('afterPostOAuthHandoff joined is no-op; skipped leaveTo + end', async () => {
    const navigate = jest.fn();
    await runPostOAuthHandoff({
      key: 'user-settle',
      owner: 'AuthCallback',
      resolveTarget: async () => '/home',
      navigate,
    });
    expect(getLastOAuthHandoffTarget()).toBe('/home');

    const leave = jest.fn();
    beginOAuthBrandBridge();
    afterPostOAuthHandoff('joined', leave);
    expect(leave).not.toHaveBeenCalled();
    expect(isOAuthBrandBridgeActive()).toBe(true);

    afterPostOAuthHandoff('skipped', leave);
    expect(leave).toHaveBeenCalledWith('/home');
    endOAuthBrandBridge(); // sync end; afterPaint is async
    expect(isOAuthBrandBridgeActive()).toBe(false);
  });

  it('reset does not kill brand bridge mid-flight (call site re-begin)', () => {
    beginOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(true);
    resetPostOAuthHandoff();
    expect(isOAuthBrandBridgeActive()).toBe(true);
    beginOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(true);
    endOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(false);
  });

  it('begin cancels pending afterPaint so stale end cannot kill new bridge', () => {
    jest.useFakeTimers();
    beginOAuthBrandBridge();
    afterPostOAuthHandoff('navigated');
    expect(isOAuthBrandBridgeActive()).toBe(true);

    beginOAuthBrandBridge();
    jest.advanceTimersByTime(250);
    expect(isOAuthBrandBridgeActive()).toBe(true);

    endOAuthBrandBridge();
    expect(isOAuthBrandBridgeActive()).toBe(false);
    jest.useRealTimers();
  });

});
