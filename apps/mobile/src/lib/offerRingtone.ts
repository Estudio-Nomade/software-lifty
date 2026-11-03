import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

// Synthetic royalty-free dual-tone beep (~1.6s), looped while IncomingRequest is open.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TRIP_REQUEST_SOUND = require('../../assets/sounds/trip-request.wav');

let player: AudioPlayer | null = null;
let generation = 0;

function releasePlayer(target: AudioPlayer | null) {
  if (!target) return;
  try {
    target.pause();
  } catch {
    /* native may already be gone */
  }
  try {
    target.remove();
  } catch {
    /* native may already be gone */
  }
}

/** Stop any in-app offer ringtone. Safe to call repeatedly. */
export function stopOfferRingtone(): void {
  generation += 1;
  const current = player;
  player = null;
  releasePlayer(current);
}

/**
 * Start a loud looping offer ringtone (singleton).
 * Previous player is stopped first so Realtime + push + poll cannot stack loops.
 */
export async function startOfferRingtone(): Promise<void> {
  if (Platform.OS === 'web') return;

  stopOfferRingtone();
  const token = generation;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });

    if (token !== generation) return;

    const next = createAudioPlayer(TRIP_REQUEST_SOUND);
    next.loop = true;
    next.volume = 1;
    next.play();

    if (token !== generation) {
      releasePlayer(next);
      return;
    }

    player = next;
  } catch (err) {
    if (__DEV__) {
      console.warn('[offerRingtone] start failed', err);
    }
  }
}
