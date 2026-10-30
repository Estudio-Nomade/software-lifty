import { createHash } from 'node:crypto';

jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');

  function bufferSourceToBuffer(data: BufferSource): Buffer {
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data);
    }
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    return Buffer.from(data as ArrayBuffer);
  }

  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: (n: number) => nodeCrypto.randomBytes(n),
    digest: async (_algorithm: string, data: BufferSource) => {
      const hash = nodeCrypto.createHash('sha256').update(bufferSourceToBuffer(data)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
  };
});

import { digestSha256 } from '../../lib/cryptoPolyfill';

function hex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('hex');
}

describe('digestSha256 (crypto polyfill path)', () => {
  it('SHA-256 empty buffer matches known digest', async () => {
    const buf = await digestSha256('SHA-256', new Uint8Array(0));
    expect(hex(buf)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('SHA-256 of "abc" bytes matches known digest', async () => {
    const data = new TextEncoder().encode('abc');
    const buf = await digestSha256('SHA-256', data);
    expect(hex(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('accepts SHA256 / object algorithm name (case-insensitive)', async () => {
    const empty = new Uint8Array(0);
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(hex(await digestSha256('SHA256', empty))).toBe(expected);
    expect(hex(await digestSha256({ name: 'sha-256' }, empty))).toBe(expected);
  });

  it('rejects non-SHA-256 algorithms', async () => {
    await expect(digestSha256('SHA-1', new Uint8Array([1]))).rejects.toThrow(/unsupported/i);
    await expect(digestSha256({ name: 'SHA-512' }, new Uint8Array([1]))).rejects.toThrow(
      /unsupported/i,
    );
  });

  it('hashes raw octets (byte > 127), not Latin1 string path', async () => {
    const data = new Uint8Array([0xff, 0x00, 0x80]);
    const buf = await digestSha256('SHA-256', data);
    const expected = createHash('sha256').update(Buffer.from(data)).digest('hex');
    expect(hex(buf)).toBe(expected);
  });

  it('honors TypedArray subarray window (byteOffset/byteLength)', async () => {
    const backing = new Uint8Array([0xaa, 0x61, 0x62, 0x63, 0xbb]); // ... "abc" ...
    const view = backing.subarray(1, 4); // "abc"
    const buf = await digestSha256('SHA-256', view);
    expect(hex(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('honors DataView window', async () => {
    const backing = new Uint8Array([0x00, 0x61, 0x62, 0x63, 0xff]);
    const view = new DataView(backing.buffer, 1, 3);
    const buf = await digestSha256('SHA-256', view);
    expect(hex(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
