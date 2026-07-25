import * as Crypto from 'expo-crypto';

const g = globalThis as any;

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
    digest: async (_algorithm: string, data: Uint8Array): Promise<ArrayBuffer> => {
      const input = Array.from(data, (b) => String.fromCharCode(b)).join('');
      const hexHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
      const bytes = new Uint8Array(hexHash.length / 2);
      for (let i = 0; i < hexHash.length; i += 2) {
        bytes[i / 2] = Number.parseInt(hexHash.substring(i, i + 2), 16);
      }
      return bytes.buffer;
    },
  };
}
