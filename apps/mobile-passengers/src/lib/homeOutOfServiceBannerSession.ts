/**
 * Soft OOF on collapsed Home: dismiss lasts this app session only
 * (module memory — survives tab hops / Home remount, dies on process kill).
 * New login clears it via resetHomeOutOfServiceBannerSession().
 * UI must read isHomeOutOfServiceBannerDismissed() and subscribe — do not mirror in useState.
 *
 * Kept free of API/supabase imports so authStore can reset on logout without
 * pulling the passenger client into unit tests that only exercise the store.
 */

let homeOofDismissed = false;
let homeOofLastInside: boolean | null = null;

type HomeOofListener = () => void;
const homeOofListeners = new Set<HomeOofListener>();

function emitHomeOofChange(): void {
  for (const listener of homeOofListeners) listener();
}

/** Re-render hooks when dismiss / fence / session reset changes. */
export function subscribeHomeOutOfServiceBanner(listener: HomeOofListener): () => void {
  homeOofListeners.add(listener);
  return () => {
    homeOofListeners.delete(listener);
  };
}

export function isHomeOutOfServiceBannerDismissed(): boolean {
  return homeOofDismissed;
}

export function dismissHomeOutOfServiceBanner(): void {
  if (homeOofDismissed) return;
  homeOofDismissed = true;
  emitHomeOofChange();
}

/**
 * Keep Home dismiss only while inside/outside is stable.
 * Crossing the fence re-arms the Home map banner.
 */
export function noteServiceAreaInside(inside: boolean): void {
  let changed = false;
  if (homeOofLastInside !== null && homeOofLastInside !== inside && homeOofDismissed) {
    homeOofDismissed = false;
    changed = true;
  }
  homeOofLastInside = inside;
  if (changed) emitHomeOofChange();
}

/** Call on logout / clearAuth so the next session sees Home OOF again. */
export function resetHomeOutOfServiceBannerSession(): void {
  const changed = homeOofDismissed || homeOofLastInside !== null;
  homeOofDismissed = false;
  homeOofLastInside = null;
  if (changed) emitHomeOofChange();
}

/** @deprecated alias — tests/old call sites */
export function resetOutOfServiceBannerDismissState(): void {
  resetHomeOutOfServiceBannerSession();
}
