import {
  isPostOAuthHandoffCompleted,
  resetPostOAuthHandoffForTests,
  runPostOAuthHandoff,
} from '../../lib/postOAuthHandoff';

describe('runPostOAuthHandoff', () => {
  beforeEach(() => {
    resetPostOAuthHandoffForTests();
  });

  it('navigates once for a key', async () => {
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
});
