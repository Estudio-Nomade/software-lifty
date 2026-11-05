import {
  invalidatePassengerProfileCompleteCache,
  readPassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from '../../lib/passengerProfileGate';
import {
  resolvePassengerPostAuthPath,
  resolvePassengerProfileComplete,
} from '../../lib/postAuthRouting';

const mockGetProfile = jest.fn();
const mockRegisterPassenger = jest.fn();
const mockNeedsLocation = jest.fn();

jest.mock('../../api/passenger', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  registerPassenger: (...args: unknown[]) => mockRegisterPassenger(...args),
}));

jest.mock('../../lib/locationPrompt', () => ({
  needsLocationPermissionPrompt: (...args: unknown[]) => mockNeedsLocation(...args),
}));

describe('resolvePassengerPostAuthPath', () => {
  beforeEach(() => {
    invalidatePassengerProfileCompleteCache();
    mockGetProfile.mockReset();
    mockRegisterPassenger.mockReset();
    mockNeedsLocation.mockReset();
    mockNeedsLocation.mockResolvedValue(false);
  });

  it('routes incomplete profile to /complete-profile (no Welcome hop)', async () => {
    mockGetProfile.mockResolvedValue({ full_name: 'A', phone: null });
    await expect(resolvePassengerPostAuthPath('user-1')).resolves.toBe('/complete-profile');
  });

  it('routes complete profile without location prompt to /home', async () => {
    writePassengerProfileCompleteCache('user-2', true);
    mockNeedsLocation.mockResolvedValue(false);
    await expect(resolvePassengerPostAuthPath('user-2')).resolves.toBe('/home');
  });

  it('routes complete profile needing location prompt to /location-permissions', async () => {
    writePassengerProfileCompleteCache('user-loc', true);
    mockNeedsLocation.mockResolvedValue(true);
    await expect(resolvePassengerPostAuthPath('user-loc')).resolves.toBe('/location-permissions');
  });

  it('returns false complete when userId is null', async () => {
    await expect(resolvePassengerProfileComplete(null)).resolves.toBe(false);
    await expect(resolvePassengerPostAuthPath(null)).resolves.toBe('/complete-profile');
  });

  it('does not cache incomplete on network failure; path falls back to complete-profile (not guest)', async () => {
    mockGetProfile.mockRejectedValue(new Error('network'));
    mockRegisterPassenger.mockRejectedValue(new Error('network'));
    await expect(resolvePassengerProfileComplete('user-net')).resolves.toBeNull();
    expect(readPassengerProfileCompleteCache('user-net')).toBeNull();
    // Authed + unknown profile must never bounce to Welcome guest CTAs.
    await expect(resolvePassengerPostAuthPath('user-net')).resolves.toBe('/complete-profile');
  });

  it('returns / only when userId is null and profile unknown', async () => {
    // null userId → complete false → complete-profile (existing gate)
    await expect(resolvePassengerPostAuthPath(null)).resolves.toBe('/complete-profile');
  });

  it('treats name+phone without home as incomplete', async () => {
    mockGetProfile.mockResolvedValue({
      id: 'p1',
      full_name: 'Ana Pérez',
      phone: '1123456789',
    });
    await expect(resolvePassengerProfileComplete('user-no-home')).resolves.toBe(false);
    await expect(resolvePassengerPostAuthPath('user-no-home')).resolves.toBe('/complete-profile');
  });
});
