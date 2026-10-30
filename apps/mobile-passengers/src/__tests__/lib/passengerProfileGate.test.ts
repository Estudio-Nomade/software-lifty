import {
  invalidatePassengerProfileCompleteCache,
  isPassengerPhoneComplete,
  isPassengerProfileComplete,
  joinFullName,
  phoneDigitCount,
  readPassengerProfileCompleteCache,
  splitGoogleName,
  writePassengerProfileCompleteCache,
} from '../../lib/passengerProfileGate';

describe('splitGoogleName', () => {
  it('prefers given_name and family_name', () => {
    expect(
      splitGoogleName({
        given_name: 'Ana',
        family_name: 'Pérez',
        full_name: 'Other Name',
        name: 'Other Name',
      }),
    ).toEqual({ firstName: 'Ana', lastName: 'Pérez' });
  });

  it('splits full_name when given/family missing', () => {
    expect(splitGoogleName({ full_name: 'Juan Carlos López' })).toEqual({
      firstName: 'Juan',
      lastName: 'Carlos López',
    });
  });

  it('falls back to name field', () => {
    expect(splitGoogleName({ name: 'María' })).toEqual({
      firstName: 'María',
      lastName: '',
    });
  });

  it('returns empty parts for null/empty meta', () => {
    expect(splitGoogleName(null)).toEqual({ firstName: '', lastName: '' });
    expect(splitGoogleName(undefined)).toEqual({ firstName: '', lastName: '' });
    expect(splitGoogleName({})).toEqual({ firstName: '', lastName: '' });
  });
});

describe('joinFullName', () => {
  it('joins trimmed parts', () => {
    expect(joinFullName('  Ana ', ' Pérez ')).toBe('Ana Pérez');
  });

  it('handles missing last name', () => {
    expect(joinFullName('Ana', '')).toBe('Ana');
  });
});

describe('phoneDigitCount / isPassengerPhoneComplete', () => {
  it('counts digits only', () => {
    expect(phoneDigitCount('+54 9 11 1234-5678')).toBe(13);
    expect(phoneDigitCount('abc')).toBe(0);
  });

  it('requires at least 8 digits', () => {
    expect(isPassengerPhoneComplete('1234567')).toBe(false);
    expect(isPassengerPhoneComplete('12345678')).toBe(true);
    expect(isPassengerPhoneComplete('+54 11 1234-5678')).toBe(true);
    expect(isPassengerPhoneComplete(null)).toBe(false);
    expect(isPassengerPhoneComplete(undefined)).toBe(false);
  });
});

describe('isPassengerProfileComplete', () => {
  it('requires usable full_name and phone', () => {
    expect(isPassengerProfileComplete({ full_name: 'Ana Pérez', phone: '1123456789' })).toBe(true);
    expect(isPassengerProfileComplete({ full_name: 'A', phone: '1123456789' })).toBe(false);
    expect(isPassengerProfileComplete({ full_name: 'Ana Pérez', phone: '123' })).toBe(false);
    expect(isPassengerProfileComplete({ full_name: null, phone: '1123456789' })).toBe(false);
    expect(isPassengerProfileComplete({ full_name: '  ', phone: '1123456789' })).toBe(false);
  });
});

describe('passenger profile complete cache', () => {
  afterEach(() => {
    invalidatePassengerProfileCompleteCache();
  });

  it('stores and reads per userId', () => {
    writePassengerProfileCompleteCache('u1', true);
    expect(readPassengerProfileCompleteCache('u1')).toBe(true);
    expect(readPassengerProfileCompleteCache('u2')).toBe(null);
  });

  it('invalidates so callers must re-resolve', () => {
    writePassengerProfileCompleteCache('u1', true);
    invalidatePassengerProfileCompleteCache();
    expect(readPassengerProfileCompleteCache('u1')).toBe(null);
  });
});
