import {
  invalidatePassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from '../../lib/passengerProfileGate';
import {
  resolvePassengerPostAuthPath,
  resolvePassengerProfileComplete,
} from '../../lib/postAuthRouting';

const mockGetProfile = jest.fn();
const mockRegisterPassenger = jest.fn();

jest.mock('../../api/passenger', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  registerPassenger: (...args: unknown[]) => mockRegisterPassenger(...args),
}));

describe('resolvePassengerPostAuthPath', () => {
  beforeEach(() => {
    invalidatePassengerProfileCompleteCache();
    mockGetProfile.mockReset();
    mockRegisterPassenger.mockReset();
  });

  it('routes incomplete profile to /complete-profile (no Welcome hop)', async () => {
    mockGetProfile.mockResolvedValue({ full_name: 'A', phone: null });
    await expect(resolvePassengerPostAuthPath('user-1')).resolves.toBe('/complete-profile');
  });

  it('routes complete profile to /home (no Welcome hop)', async () => {
    writePassengerProfileCompleteCache('user-2', true);
    await expect(resolvePassengerPostAuthPath('user-2')).resolves.toBe('/home');
  });

  it('returns false complete when userId is null', async () => {
    await expect(resolvePassengerProfileComplete(null)).resolves.toBe(false);
    await expect(resolvePassengerPostAuthPath(null)).resolves.toBe('/complete-profile');
  });
});
