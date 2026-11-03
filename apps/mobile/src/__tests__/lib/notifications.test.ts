const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockIsRunningInExpoGo = jest.fn(() => false);
const mockApiPost = jest.fn(() => Promise.resolve({ data: {} }));
const mockApiGet = jest.fn();
const mockSetActiveTrip = jest.fn();

jest.mock('expo', () => ({
  isRunningInExpoGo: () => mockIsRunningInExpoGo(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { eas: { projectId: 'test-eas-project-id' } },
      slug: 'lifty-driver',
    },
  },
}));

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
}));

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePostAuthRoute: jest.fn(async () => ({ screen: 'Active', status: 'approved' })),
  routeForDriverStatus: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      setDriverStatus: jest.fn(),
      setOnboardingStep: jest.fn(),
    }),
  },
}));

jest.mock('../../store/tripStore', () => ({
  useTripStore: {
    getState: () => ({
      trip: null,
      activeTripId: null,
      setActiveTrip: mockSetActiveTrip,
    }),
  },
}));

import { Platform } from 'react-native';
import {
  ensurePushRegistration,
  handleNotificationResponse,
  hydrateTripOfferFromPush,
  type NotificationResponseLike,
  PUSH_PERMISSION_DENIED_MSG,
  registerForPush,
} from '../../lib/notifications';

function makeResponse(type: string, extra?: Record<string, string>): NotificationResponseLike {
  return {
    notification: {
      request: {
        content: {
          data: { type, ...extra },
        },
      },
    },
  };
}

describe('handleNotificationResponse driver review', () => {
  it('routes driver:approved and legacy kyc:approved to Active', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('driver:approved'), navigate);
    expect(navigate).toHaveBeenCalledWith('Active');

    navigate.mockClear();
    handleNotificationResponse(makeResponse('kyc:approved'), navigate);
    expect(navigate).toHaveBeenCalledWith('Active');
  });

  it('routes driver:rejected and kyc:rejected to OnboardingStep2 (not WaitingApproval)', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('driver:rejected', { reason: 'bad license' }), navigate);
    expect(navigate).toHaveBeenCalledWith('OnboardingStep2', { reviewReason: 'bad license' });
    expect(navigate).not.toHaveBeenCalledWith('WaitingApproval');

    navigate.mockClear();
    handleNotificationResponse(makeResponse('kyc:rejected'), navigate);
    expect(navigate).toHaveBeenCalledWith('OnboardingStep2', undefined);
    expect(navigate).not.toHaveBeenCalledWith('WaitingApproval');
  });

  it('routes driver:review_notes to Messages inbox (soft, not reject)', () => {
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('driver:review_notes', {
        reason: 'Falta dorso de la licencia',
        message_id: 'msg-1',
      }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('Messages', {
      messageId: 'msg-1',
      reviewReason: 'Falta dorso de la licencia',
    });
    expect(navigate).not.toHaveBeenCalledWith('WaitingApproval');
    expect(navigate).not.toHaveBeenCalledWith('OnboardingStep2', expect.anything());
  });

  it('routes driver:review_notes without message_id still opens Messages', () => {
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('driver:review_notes', { reason: 'Falta dorso' }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('Messages', { reviewReason: 'Falta dorso' });
  });

  it('routes driver:commission_debt_block to PayCommissionDebt', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('driver:commission_debt_block'), navigate);
    expect(navigate).toHaveBeenCalledWith('PayCommissionDebt');
  });
});

describe('trip:request push hydrate', () => {
  const offer = {
    id: 'trip-offer-1',
    status: 'offered',
    origin_address: 'A',
    dest_address: 'B',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockReset();
  });

  it('hydrates from /trips/active then setActiveTrip + IncomingRequest', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: offer } });
    const navigate = jest.fn();
    await hydrateTripOfferFromPush('trip-offer-1', navigate);
    expect(mockApiGet).toHaveBeenCalledWith('/trips/active');
    expect(mockSetActiveTrip).toHaveBeenCalledWith(offer);
    expect(navigate).toHaveBeenCalledWith('IncomingRequest');
  });

  it('falls back to GET /trips/:id when active is empty', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: offer } });
    const navigate = jest.fn();
    await hydrateTripOfferFromPush('trip-offer-1', navigate);
    expect(mockApiGet).toHaveBeenCalledWith('/trips/trip-offer-1');
    expect(mockSetActiveTrip).toHaveBeenCalledWith(offer);
    expect(navigate).toHaveBeenCalledWith('IncomingRequest');
  });

  it('handleNotificationResponse trip:request triggers hydrate path', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: offer } });
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('trip:request', { trip_id: 'trip-offer-1' }),
      navigate,
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApiGet).toHaveBeenCalledWith('/trips/active');
    expect(navigate).toHaveBeenCalledWith('IncomingRequest');
  });

  it('navigates IncomingRequest even if fetch fails (screen retries)', async () => {
    mockApiGet.mockRejectedValue(new Error('network'));
    const navigate = jest.fn();
    await hydrateTripOfferFromPush('trip-offer-1', navigate);
    expect(mockSetActiveTrip).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('IncomingRequest');
  });
});

describe('ensurePushRegistration / registerForPush', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRunningInExpoGo.mockReturnValue(false);
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    mockSetNotificationChannelAsync.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  });

  it('granted → token + POST /notifications/token', async () => {
    const result = await ensurePushRegistration();
    expect(result).toEqual({ ok: true, token: 'ExponentPushToken[test]' });
    expect(mockApiPost).toHaveBeenCalledWith('/notifications/token', {
      token: 'ExponentPushToken[test]',
      platform: 'android',
    });
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      'trip-offers',
      expect.objectContaining({ name: 'Ofertas de viaje' }),
    );
  });

  it('registerForPush returns token string on success without requiring POST', async () => {
    const token = await registerForPush();
    expect(token).toBe('ExponentPushToken[test]');
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('denied → reason permission_denied with ES copy', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });
    const result = await ensurePushRegistration();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('permission_denied');
      expect(result.message).toBe(PUSH_PERMISSION_DENIED_MSG);
      expect(result.canOpenSettings).toBe(true);
    }
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('catch/register error → reason register_error', async () => {
    mockGetExpoPushTokenAsync.mockRejectedValue(new Error('native boom'));
    const result = await ensurePushRegistration();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('register_error');
    }
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('POST fail → reason post_failed', async () => {
    mockApiPost.mockRejectedValue(new Error('401'));
    const result = await ensurePushRegistration();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('post_failed');
    }
  });

  it('Expo Go Android → unavailable (no hard fail path for GO gate)', async () => {
    mockIsRunningInExpoGo.mockReturnValue(true);
    const result = await ensurePushRegistration();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unavailable');
    }
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });
});

