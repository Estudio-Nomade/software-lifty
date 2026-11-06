import { apiClient } from '../../api/client';
import { fetchLoginHint } from '../../api/loginHint';

jest.mock('../../api/client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

const post = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

describe('fetchLoginHint', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('returns googleOnly from backend and caches by normalized email', async () => {
    post.mockResolvedValueOnce({ data: { googleOnly: true } } as never);

    const first = await fetchLoginHint('  Martina@Lifty.app ');
    const second = await fetchLoginHint('martina@lifty.app');

    expect(first).toEqual({ googleOnly: true });
    expect(second).toEqual({ googleOnly: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/auth/login-hint', { email: 'martina@lifty.app' });
  });

  it('returns null on network failure', async () => {
    post.mockRejectedValueOnce(new Error('network'));
    await expect(fetchLoginHint('other@lifty.app')).resolves.toBeNull();
  });

  it('returns null for empty email without calling API', async () => {
    await expect(fetchLoginHint('   ')).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
