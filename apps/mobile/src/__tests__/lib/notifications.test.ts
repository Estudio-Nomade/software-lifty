import {
  handleNotificationResponse,
  type NotificationResponseLike,
} from '../../lib/notifications';

jest.mock('../../lib/postAuthRouting', () => ({
  resolvePostAuthRoute: jest.fn(async () => ({ screen: 'Active', status: 'approved' })),
  routeForDriverStatus: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: {} })) },
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      setDriverStatus: jest.fn(),
      setOnboardingStep: jest.fn(),
    }),
  },
}));

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

