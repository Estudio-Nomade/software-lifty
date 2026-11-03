const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockRemove = jest.fn();
const mockCreateAudioPlayer = jest.fn();
const mockSetAudioModeAsync = jest.fn(() => Promise.resolve());

function makePlayer() {
  return {
    loop: false,
    volume: 0,
    play: mockPlay,
    pause: mockPause,
    remove: mockRemove,
  };
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

jest.mock('../../../assets/sounds/trip-request.wav', () => 42, { virtual: true });

import { Platform } from 'react-native';
import { startOfferRingtone, stopOfferRingtone } from '../../lib/offerRingtone';

describe('offerRingtone', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockPlay.mockReset();
    mockPause.mockReset();
    mockRemove.mockReset();
    mockCreateAudioPlayer.mockReset();
    mockSetAudioModeAsync.mockReset();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockCreateAudioPlayer.mockImplementation(() => makePlayer());
    stopOfferRingtone();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
  });

  afterEach(() => {
    stopOfferRingtone();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  });

  test('start configures silent-mode audio, loops, full volume, and plays', async () => {
    await startOfferRingtone();

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      }),
    );
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    const player = mockCreateAudioPlayer.mock.results[0].value;
    expect(player.loop).toBe(true);
    expect(player.volume).toBe(1);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  test('stop pauses and removes the active player', async () => {
    await startOfferRingtone();
    stopOfferRingtone();

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  test('double start stops previous player before creating a new one', async () => {
    await startOfferRingtone();
    const first = mockCreateAudioPlayer.mock.results[0].value;
    await startOfferRingtone();

    expect(first.pause).toHaveBeenCalled();
    expect(first.remove).toHaveBeenCalled();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });

  test('stop is a no-op when nothing is playing', () => {
    expect(() => stopOfferRingtone()).not.toThrow();
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('start is a no-op on web', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    await startOfferRingtone();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
  });

  test('releases player if play throws after create', async () => {
    mockCreateAudioPlayer.mockImplementation(() => {
      const p = makePlayer();
      p.play.mockImplementation(() => {
        throw new Error('play failed');
      });
      return p;
    });

    await startOfferRingtone();

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
