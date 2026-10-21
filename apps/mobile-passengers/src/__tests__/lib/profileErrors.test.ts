import { getFriendlyProfileError } from '../../lib/profileErrors';

describe('getFriendlyProfileError', () => {
  it('maps PHONE_TAKEN from axios body', () => {
    const msg = getFriendlyProfileError({
      response: {
        status: 409,
        data: {
          error: {
            code: 'PHONE_TAKEN',
            message: 'Ese teléfono ya está registrado en otra cuenta.',
          },
        },
      },
    });
    expect(msg).toMatch(/tel[eé]fono/i);
    expect(msg.toLowerCase()).not.toContain('conexión');
  });

  it('maps PHONE_TOO_LONG', () => {
    const msg = getFriendlyProfileError({
      response: {
        status: 400,
        data: { error: { code: 'PHONE_TOO_LONG', message: 'too long' } },
      },
    });
    expect(msg).toMatch(/largo|20/i);
  });

  it('maps PHONE_REQUIRED', () => {
    const msg = getFriendlyProfileError({
      response: {
        status: 400,
        data: { error: { code: 'PHONE_REQUIRED', message: 'required' } },
      },
    });
    expect(msg).toMatch(/tel[eé]fono/i);
  });

  it('maps network errors to connection copy', () => {
    const msg = getFriendlyProfileError({ code: 'ERR_NETWORK', message: 'Network Error' });
    expect(msg.toLowerCase()).toMatch(/conexi[oó]n|internet/);
  });

  it('does not claim connection for generic server errors', () => {
    const msg = getFriendlyProfileError(new Error('Internal server error'));
    expect(msg.toLowerCase()).not.toContain('conexión');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('surfaces backend message when present', () => {
    const msg = getFriendlyProfileError({
      response: {
        status: 500,
        data: { error: { code: 'INTERNAL_ERROR', message: 'Storage bucket missing' } },
      },
    });
    expect(msg).toBe('Storage bucket missing');
  });
});
