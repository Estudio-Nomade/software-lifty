import { classifySignUpResult } from '../../lib/signupEmail';

describe('classifySignUpResult', () => {
  it('returns session when Supabase logs the user in immediately', () => {
    const session = { access_token: 't' } as never;
    const outcome = classifySignUpResult(
      { user: { id: '1' } as never, session },
      'a@b.com',
    );
    expect(outcome).toEqual({ kind: 'session', session });
  });

  it('returns needs_verify when identities exist and confirmation was stamped', () => {
    const outcome = classifySignUpResult(
      {
        user: {
          id: '1',
          confirmation_sent_at: '2026-08-30T22:53:56Z',
          identities: [{ id: 'i1' }],
        } as never,
        session: null,
      },
      'a@b.com',
    );
    expect(outcome).toEqual({
      kind: 'needs_verify',
      email: 'a@b.com',
      confirmationSent: true,
    });
  });

  it('flags confirmationSent false when identities exist but no sent stamp', () => {
    const outcome = classifySignUpResult(
      {
        user: {
          id: '1',
          confirmation_sent_at: null,
          identities: [{ id: 'i1' }],
        } as never,
        session: null,
      },
      'a@b.com',
    );
    expect(outcome).toEqual({
      kind: 'needs_verify',
      email: 'a@b.com',
      confirmationSent: false,
    });
  });

  it('returns already_registered on empty identities (anti-enumeration)', () => {
    const outcome = classifySignUpResult(
      {
        user: { id: '1', identities: [] } as never,
        session: null,
      },
      'a@b.com',
    );
    expect(outcome).toEqual({ kind: 'already_registered' });
  });
});
