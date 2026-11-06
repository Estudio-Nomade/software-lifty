import {
  OAUTH_HANDOFF_ABORTED,
  WELCOME_HOP_REFUSED,
  isPostOAuthHandoffCompleted,
  resetPostOAuthHandoff,
  resetPostOAuthHandoffForTests,
  runPostOAuthHandoff,
} from '../../lib/postOAuthHandoff';

describe('runPostOAuthHandoff', () => {
  beforeEach(() => {
    resetPostOAuthHandoffForTests();
  });

  it('navigates once for a key', async () => {
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
});
