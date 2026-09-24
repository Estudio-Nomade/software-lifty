process.env.NODE_ENV = 'test';

import { describe, expect, test } from 'bun:test';
import {
  DRIVER_APPROVED_PUSH,
  driverRejectedPush,
  shortReviewReason,
} from './driver-review-push';

describe('driver review notify copy', () => {
  test('DRIVER_APPROVED_PUSH uses canonical type and 30d stickers body', () => {
    expect(DRIVER_APPROVED_PUSH.title).toBe('¡Fuiste aprobado!');
    expect(DRIVER_APPROVED_PUSH.body).toContain('30 días');
    expect(DRIVER_APPROVED_PUSH.data.type).toBe('driver:approved');
    expect(DRIVER_APPROVED_PUSH.channelId).toBe('account');
  });

  test('shortReviewReason falls back when empty', () => {
    expect(shortReviewReason(null)).toContain('Entrá a la app');
    expect(shortReviewReason('')).toContain('Entrá a la app');
    expect(shortReviewReason('   ')).toContain('Entrá a la app');
  });

  test('shortReviewReason truncates long notes', () => {
    const long = 'x'.repeat(200);
    const out = shortReviewReason(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith('...')).toBe(true);
  });

  test('shortReviewReason strips simple HTML tags', () => {
    expect(shortReviewReason('<b>Licencia</b> ilegible')).toBe('Licencia ilegible');
  });

  test('driverRejectedPush embeds reason in body and data', () => {
    const push = driverRejectedPush('Licencia vencida');
    expect(push.title).toBe('No pudimos aprobar tus documentos');
    expect(push.body).toBe('Licencia vencida');
    expect(push.data.type).toBe('driver:rejected');
    expect(push.data.reason).toBe('Licencia vencida');
    expect(push.channelId).toBe('account');
  });
});

describe('sendPushToUser web filter (contract)', () => {
  test('device fan-out excludes platform=web', () => {
    const tokens = [
      { token: 'ExponentPushToken[abc]', platform: 'android' },
      { token: 'https://fcm.googleapis.com/fcm/send/web-sub', platform: 'web' },
      { token: 'ExponentPushToken[xyz]', platform: 'ios' },
    ];
    const deviceTokens = tokens.filter((t) => t.platform !== 'web');
    expect(deviceTokens).toHaveLength(2);
    expect(deviceTokens.every((t) => t.platform !== 'web')).toBe(true);
  });
});
