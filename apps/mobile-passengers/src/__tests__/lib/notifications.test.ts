import {
  handleNotificationResponse,
  type NotificationResponseLike,
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

describe('handleNotificationResponse passenger', () => {
  it('routes trip:message to Chat with tripId when present', () => {
    const navigate = jest.fn();
    handleNotificationResponse(
      makeResponse('trip:message', { trip_id: 'trip-abc', sender_role: 'driver' }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('Chat', { tripId: 'trip-abc' });
  });

  it('routes trip:message to Chat without params when trip_id missing', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:message'), navigate);
    expect(navigate).toHaveBeenCalledWith('Chat', undefined);
  });

  it('routes trip:cancelled to Home', () => {
    const navigate = jest.fn();
    handleNotificationResponse(makeResponse('trip:cancelled'), navigate);
    expect(navigate).toHaveBeenCalledWith('Home');
  });
});
