const mockRemoveChannel = jest.fn();
const mockChannelFn = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannelFn(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

import {
  __resetTripHubsForTests,
  subscribeToDriverLocation,
  subscribeToTripChannel,
} from '../../lib/realtime';

function makeChannel() {
  const channel = {
    on: jest.fn(function on(this: unknown) {
      return this;
    }),
    subscribe: jest.fn((cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED');
      return 'ok';
    }),
  };
  return channel;
}

describe('trip channel hub', () => {
  beforeEach(() => {
    mockRemoveChannel.mockReset();
    mockChannelFn.mockReset();
    mockChannelFn.mockImplementation(() => makeChannel());
    __resetTripHubsForTests();
  });

  test('chat + location share a single channel for the same trip', () => {
    const unsubChat = subscribeToTripChannel('trip-1', { onMessage: jest.fn() });
    const unsubLoc = subscribeToDriverLocation('trip-1', jest.fn());

    expect(mockChannelFn).toHaveBeenCalledTimes(1);
    expect(mockChannelFn).toHaveBeenCalledWith(
      'trip:trip-1',
      expect.objectContaining({ config: { broadcast: { self: false } } }),
    );

    unsubChat();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    unsubLoc();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  test('second chat subscriber does not recreate the channel', () => {
    const a = subscribeToTripChannel('trip-2', { onMessage: jest.fn() });
    const b = subscribeToTripChannel('trip-2', { onMessage: jest.fn() });

    expect(mockChannelFn).toHaveBeenCalledTimes(1);

    a();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
    b();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  test('different trips get different channels', () => {
    const a = subscribeToTripChannel('trip-a', { onMessage: jest.fn() });
    const b = subscribeToTripChannel('trip-b', { onMessage: jest.fn() });

    expect(mockChannelFn).toHaveBeenCalledTimes(2);
    a();
    b();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
  });
});
