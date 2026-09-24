import type * as Notifications from 'expo-notifications';
import { handleNotificationResponse } from '../../lib/notifications';

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePostAuthRoute: jest.fn(async () => ({ screen: 'Active', status: 'approved' })),
  routeForDriverStatus: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  apiClient: { get: jest.fn() },
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      setDriverStatus: jest.fn(),
      setOnboardingStep: jest.fn(),
    }),
  },
}));

function makeResponse(type: string, extra?: Record<string, string>): Notifications.NotificationResponse {
  return {
    notification: {
      request: {
        content: {
          data: { type, ...extra },
        },
      },
    },
  } as unknown as Notifications.NotificationResponse;
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
});
