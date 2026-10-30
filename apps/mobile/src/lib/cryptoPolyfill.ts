import * as Crypto from 'expo-crypto';

const g = globalThis as any;

type AlgorithmIdentifier = string | { name: string };

function toBufferSource(data: BufferSource): BufferSource {
  return data;
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
  return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, toBufferSource(data));
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
    digest: digestSha256,
  };
}
