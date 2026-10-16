import type * as Notifications from 'expo-notifications';
import {
  handleNotificationReceived,
  handleNotificationResponse,
} from '../../lib/notifications';

const mockSetDriverStatus = jest.fn();
const mockSetOnboardingStep = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePostAuthRoute: jest.fn(async () => ({ screen: 'Active', status: 'approved' })),
  routeForDriverStatus: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  apiClient: { get: jest.fn() },
}));

jest.mock('../../lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      setDriverStatus: mockSetDriverStatus,
      setOnboardingStep: mockSetOnboardingStep,
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

function makeNotification(type: string, extra?: Record<string, string>): Notifications.Notification {
  return {
    request: {
      content: {
        data: { type, ...extra },
      },
    },
  } as unknown as Notifications.Notification;
}

describe('handleNotificationResponse driver review', () => {
  beforeEach(() => {
    mockSetDriverStatus.mockClear();
    mockSetOnboardingStep.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it('routes driver:approved and legacy kyc:approved to Active', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('driver:approved'), navigate);
    expect(navigate).toHaveBeenCalledWith('Active');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['driverStatus'] });

    navigate.mockClear();
    mockInvalidateQueries.mockClear();
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

  it('routes driver:review_notes to OnboardingStep2 with reason (soft, not reject)', () => {
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('driver:review_notes', { reason: 'Falta dorso de la licencia' }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('OnboardingStep2', {
      reviewReason: 'Falta dorso de la licencia',
    });
    expect(navigate).not.toHaveBeenCalledWith('WaitingApproval');
  });
});

describe('handleNotificationReceived foreground review', () => {
  beforeEach(() => {
    mockSetDriverStatus.mockClear();
    mockSetOnboardingStep.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it('refreshes store + invalidates driverStatus without navigating on approve', () => {
    const navigate = jest.fn();
    handleNotificationReceived(makeNotification('driver:approved'), navigate);
    expect(mockSetDriverStatus).toHaveBeenCalledWith('approved');
    expect(mockSetOnboardingStep).toHaveBeenCalledWith('approved');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['driverStatus'] });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores non-review notification types', () => {
    const navigate = jest.fn();
    handleNotificationReceived(makeNotification('trip:request'), navigate);
    expect(mockSetDriverStatus).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
