/**
 * Single-flight post-OAuth navigation + single BrandSplash bridge.
 * Survives AuthCallback remount (module-level). Twin path (deep link +
 * handleGoogle) must share this so BrandSplash mounts ≤1 time and replace
 * happens once.
 *
 * Generation token: resetPostOAuthHandoff() invalidates in-flight work so a
 * stale resolve cannot navigate or mark completedKey after a new Google attempt.
 */

export const OAUTH_HANDOFF_ABORTED = 'OAUTH_HANDOFF_ABORTED';
export const WELCOME_HOP_REFUSED = 'WELCOME_HOP_REFUSED';

type HandoffOutcome = { ok: true; target: string } | { ok: false; error: unknown };

let generation = 0;
let inflight: Promise<HandoffOutcome> | null = null;
let completedKey: string | null = null;
let lastTarget: string | null = null;

/** One global BrandSplash overlay while OAuth completes (root layout). */
let brandBridgeActive = false;
const brandBridgeListeners = new Set<() => void>();
let endBridgeTimer: ReturnType<typeof setTimeout> | null = null;

export type PostOAuthHandoffResult = 'navigated' | 'skipped' | 'joined';

function notifyBrandBridge(): void {
  for (const listener of brandBridgeListeners) {
    listener();
  }
}

function clearPendingEndBridge(): void {
  if (endBridgeTimer != null) {
    clearTimeout(endBridgeTimer);
    endBridgeTimer = null;
  }
}

export function subscribeOAuthBrandBridge(listener: () => void): () => void {
  brandBridgeListeners.add(listener);
  return () => {
    brandBridgeListeners.delete(listener);
  };
}

export function isOAuthBrandBridgeActive(): boolean {
  return brandBridgeActive;
}

/** Show the single BrandSplash overlay (warm Google / cold AuthCallback). */
export function beginOAuthBrandBridge(): void {
  if (brandBridgeActive) return;
  brandBridgeActive = true;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[oauth-handoff] brand bridge ON');
  }
  notifyBrandBridge();
}

/** Hide overlay after destination is on screen. */
export function endOAuthBrandBridge(): void {
  clearPendingEndBridge();
  if (!brandBridgeActive) return;
  brandBridgeActive = false;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[oauth-handoff] brand bridge OFF');
  }
  notifyBrandBridge();
}

/** End bridge after destination can paint under the splash (cap ~200ms). */
export function endOAuthBrandBridgeAfterPaint(): void {
  clearPendingEndBridge();
  endBridgeTimer = setTimeout(() => {
    endBridgeTimer = null;
    endOAuthBrandBridge();
  }, 200);
}

export function getLastOAuthHandoffTarget(): string | null {
  return lastTarget;
}

/**
 * Settle after runPostOAuthHandoff at a call site.
 * - navigated: end bridge after paint (this owner led)
 * - skipped: optional one leaveTo(lastTarget) to unmount bridge screens + end
 * - joined: no-op — leader already navigated and will end the bridge
 */
export function afterPostOAuthHandoff(
  result: PostOAuthHandoffResult,
  leaveTo?: (target: string) => void,
): void {
  if (result === 'joined') return;
  if (result === 'skipped' && leaveTo) {
    const target = getLastOAuthHandoffTarget();
    if (target) leaveTo(target);
  }
  endOAuthBrandBridgeAfterPaint();
}

export function resetPostOAuthHandoff(): void {
  generation += 1;
  inflight = null;
  completedKey = null;
  lastTarget = null;
}

/** @deprecated alias for tests */
export const resetPostOAuthHandoffForTests = (): void => {
  resetPostOAuthHandoff();
  endOAuthBrandBridge();
};

export function isPostOAuthHandoffCompleted(key?: string): boolean {
  if (completedKey == null) return false;
  if (key == null) return true;
  return completedKey === key;
}

function isForbiddenTarget(target: string): boolean {
  return !target || target === '/' || target === 'Welcome';
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error ?? 'handoff failed'));
}

/**
 * One resolve + one navigate per key. Concurrent callers join the same flight.
 * If the leader fails, joiners observe the failure and may become the next leader
 * (they do not silently return 'joined'). Reset bumps generation so stale work
 * cannot commit navigate/completedKey.
 */
export async function runPostOAuthHandoff(opts: {
  key: string;
  owner: string;
  resolveTarget: () => Promise<string>;
  navigate: (target: string) => void;
}): Promise<PostOAuthHandoffResult> {
  const key = opts.key || 'session';
  const genAtStart = generation;

  beginOAuthBrandBridge();

  for (let attempt = 0; attempt < 4; attempt++) {
    if (generation !== genAtStart) {
      throw new Error(OAUTH_HANDOFF_ABORTED);
    }
    if (completedKey === key) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[oauth-handoff] skip already completed key=', key, 'owner=', opts.owner);
      }
      return attempt === 0 ? 'skipped' : 'joined';
    }

    const existing = inflight;
    if (existing) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[oauth-handoff] join inflight owner=', opts.owner);
      }
      const outcome = await existing;
      if (inflight === existing) {
        inflight = null;
      }
      if (generation !== genAtStart) {
        throw new Error(OAUTH_HANDOFF_ABORTED);
      }
      if (outcome.ok) {
        return 'joined';
      }
      continue;
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[oauth-handoff] start key=', key, 'owner=', opts.owner);
    }

    const myGen = generation;
    const workPromise: Promise<HandoffOutcome> = (async () => {
      try {
        const target = await opts.resolveTarget();
        if (generation !== myGen) {
          return { ok: false, error: new Error(OAUTH_HANDOFF_ABORTED) };
        }
        if (isForbiddenTarget(target)) {
          return { ok: false, error: new Error(WELCOME_HOP_REFUSED) };
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[oauth-handoff] replace →', target, 'owner=', opts.owner);
        }
        lastTarget = target;
        opts.navigate(target);
        if (generation !== myGen) {
          return { ok: false, error: new Error(OAUTH_HANDOFF_ABORTED) };
        }
        completedKey = key;
        return { ok: true, target };
      } catch (error) {
        return { ok: false, error };
      }
    })();

    inflight = workPromise;
    const outcome = await workPromise;
    if (inflight === workPromise) {
      inflight = null;
    }

    if (generation !== genAtStart) {
      throw new Error(OAUTH_HANDOFF_ABORTED);
    }
    if (outcome.ok) {
      return 'navigated';
    }
    throw toError(outcome.error);
  }

  throw new Error(OAUTH_HANDOFF_ABORTED);
}
