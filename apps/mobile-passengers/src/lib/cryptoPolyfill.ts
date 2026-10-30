import * as Crypto from 'expo-crypto';

const g = globalThis as any;

type AlgorithmIdentifier = string | { name: string };

/**
 * Normalize BufferSource to a contiguous Uint8Array owned copy of the view window.
 * Honors byteOffset/byteLength so subarrays / DataView never hash the full backing store.
 */
function toOwnedBytes(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  }
  return new Uint8Array(data);
}

function resolveSha256Algorithm(algorithm: AlgorithmIdentifier): void {
  const name =
    typeof algorithm === 'string'
      ? algorithm
      : algorithm && typeof algorithm === 'object' && 'name' in algorithm
        ? String(algorithm.name)
        : '';
  const norm = name.toUpperCase().replace(/-/g, '');
  if (norm !== 'SHA256') {
    throw new Error(`crypto.subtle.digest: unsupported algorithm "${name}" (only SHA-256)`);
  }
}

/** Exported for unit tests — same path used by the polyfill. */
export async function digestSha256(
  algorithm: AlgorithmIdentifier,
  data: BufferSource,
): Promise<ArrayBuffer> {
  resolveSha256Algorithm(algorithm);
  return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, toOwnedBytes(data));
}

if (!g.crypto) {
  g.crypto = {};
}

if (!g.crypto.getRandomValues) {
  g.crypto.getRandomValues = (array: Uint8Array) => {
    const bytes = Crypto.getRandomBytes(array.length);
    for (let i = 0; i < bytes.length; i++) {
      array[i] = bytes[i];
    }
    return array;
  };
}

if (!g.crypto.subtle?.digest) {
  g.crypto.subtle = {
    ...(g.crypto.subtle ?? {}),
    digest: digestSha256,
  };
}
