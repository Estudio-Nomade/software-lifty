/**
 * Single-flight post-OAuth navigation lock.
 * Survives AuthCallback remount (module-level). Twin path (deep link +
 * handleGoogle) must share this so BrandSplash / replace only happens once.
 */

let inflight: Promise<string> | null = null;
let completedKey: string | null = null;

export type PostOAuthHandoffResult = 'navigated' | 'skipped' | 'joined';

export function resetPostOAuthHandoff(): void {
  inflight = null;
  completedKey = null;
}

/** @deprecated alias for tests */
export const resetPostOAuthHandoffForTests = resetPostOAuthHandoff;

export function isPostOAuthHandoffCompleted(key?: string): boolean {
  if (completedKey == null) return false;
  if (key == null) return true;
  return completedKey === key;
}

export async function runPostOAuthHandoff(opts: {
  key: string;
  owner: string;
  resolveTarget: () => Promise<string>;
  navigate: (target: string) => void;
}): Promise<PostOAuthHandoffResult> {
  const key = opts.key || 'session';

  if (completedKey === key) {
    if (__DEV__) {
      console.log('[oauth-handoff] skip already completed key=', key, 'owner=', opts.owner);
    }
    return 'skipped';
  }

  if (inflight) {
    if (__DEV__) {
      console.log('[oauth-handoff] join inflight owner=', opts.owner);
    }
    await inflight;
    return 'joined';
  }

  if (__DEV__) {
    console.log('[oauth-handoff] start key=', key, 'owner=', opts.owner);
  }

  const work = (async () => {
    const target = await opts.resolveTarget();
    if (__DEV__) {
      console.log('[oauth-handoff] replace →', target, 'owner=', opts.owner);
    }
    opts.navigate(target);
    // Mark after navigate so a refused hop (e.g. Welcome) can retry.
    completedKey = key;
    return target;
  })();

  inflight = work.finally(() => {
    inflight = null;
  });

  await inflight;
  return 'navigated';
}
