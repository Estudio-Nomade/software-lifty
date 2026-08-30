import { resendSignupEmailOtp, verifySignupEmailOtp } from '../../lib/signupEmail';

function mockClient(verifyImpl: jest.Mock, resendImpl?: jest.Mock) {
  return {
    auth: {
      verifyOtp: verifyImpl,
      resend: resendImpl ?? jest.fn(),
    },
  } as never;
}

describe('verifySignupEmailOtp', () => {
  it('returns on signup type success without trying email', async () => {
    const verifyOtp = jest
      .fn()
      .mockResolvedValueOnce({ data: { user: { id: 'u' }, session: { access_token: 't' } }, error: null });
    const client = mockClient(verifyOtp);
    const data = await verifySignupEmailOtp(client, 'a@b.com', '123456');
    expect(data.session).toEqual({ access_token: 't' });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      token: '123456',
      type: 'signup',
    });
  });

  it('falls back to email type when signup fails', async () => {
    const verifyOtp = jest
      .fn()
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'bad' } })
      .mockResolvedValueOnce({
        data: { user: { id: 'u' }, session: { access_token: 't2' } },
        error: null,
      });
    const client = mockClient(verifyOtp);
    const data = await verifySignupEmailOtp(client, 'a@b.com', '123456');
    expect(data.session).toEqual({ access_token: 't2' });
    expect(verifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'a@b.com',
      token: '123456',
      type: 'email',
    });
  });

  it('throws when both types fail', async () => {
    const verifyOtp = jest
      .fn()
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'a' } })
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'b' } });
    const client = mockClient(verifyOtp);
    await expect(verifySignupEmailOtp(client, 'a@b.com', '000000')).rejects.toEqual({
      message: 'b',
    });
  });
});

describe('resendSignupEmailOtp', () => {
  it('calls auth.resend with type signup', async () => {
    const resend = jest.fn().mockResolvedValue({ data: {}, error: null });
    const client = mockClient(jest.fn(), resend);
    await resendSignupEmailOtp(client, 'a@b.com');
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' });
  });

  it('throws on resend error', async () => {
    const resend = jest.fn().mockResolvedValue({ data: {}, error: { message: 'rate' } });
    const client = mockClient(jest.fn(), resend);
    await expect(resendSignupEmailOtp(client, 'a@b.com')).rejects.toEqual({ message: 'rate' });
  });
});
