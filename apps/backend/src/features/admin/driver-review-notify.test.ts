process.env.NODE_ENV = 'test';

import { describe, expect, test } from 'bun:test';
import {
  buildDocsResubmitEmailHtml,
  DOCS_RESUBMIT_APPROVE_CTA,
  DOCS_RESUBMIT_SUBJECT,
  LICENSE_RESUBMIT_CONTEXT,
  selectDocsForResubmitEmail,
} from './notifications';
import {
  DRIVER_APPROVED_PUSH,
  driverRejectedPush,
  driverReviewNotesPush,
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

  test('driverReviewNotesPush is soft correction (not rejected type)', () => {
    const push = driverReviewNotesPush('Falta dorso de la licencia');
    expect(push.title).toBe('Necesitamos que corrijas documentación');
    expect(push.body).toBe('Falta dorso de la licencia');
    expect(push.data.type).toBe('driver:review_notes');
    expect(push.data.reason).toBe('Falta dorso de la licencia');
    expect(push.channelId).toBe('account');
  });

  test('driverReviewNotesPush includes message_id when provided', () => {
    const push = driverReviewNotesPush('Falta dorso', 'msg-uuid-1');
    expect(push.data.message_id).toBe('msg-uuid-1');
    expect(push.data.type).toBe('driver:review_notes');
  });

  test('driverReviewNotesPush includes badge for iOS/Android app icon', () => {
    const push = driverReviewNotesPush('Falta dorso', 'msg-1', 3);
    expect(push.badge).toBe(3);
    const noBadge = driverReviewNotesPush('x');
    expect(noBadge.badge).toBeUndefined();
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

describe('admin docs resubmit notify copy (contract)', () => {
  test('resubmit subject and push type differ from first-time alta', () => {
    const resubmitSubject = DOCS_RESUBMIT_SUBJECT;
    const newDriverSubjectPrefix = 'Nuevo conductor:';
    expect(resubmitSubject).not.toContain('Nuevo conductor');
    expect(newDriverSubjectPrefix.startsWith('Nuevo conductor')).toBe(true);

    const resubmitPushType = 'admin:driver_docs_resubmitted';
    const newDriverPushType = 'new_driver_review';
    expect(resubmitPushType).not.toBe(newDriverPushType);
  });

  test('resubmit HTML includes file links, approve CTA and token URL', () => {
    const fileUrl = 'https://cdn.example.com/drivers/lic-front.jpg';
    const approveUrl = 'https://api.liftyviajes.com/api/admin/approve?token=tok-abc-123';
    const { subject, html } = buildDocsResubmitEmailHtml({
      fullName: 'Ana Driver',
      phone: '+549111',
      email: 'ana@example.com',
      driverId: 'drv-1',
      approveUrl,
      adminDeepLink: null,
      docTypes: ['license_front'],
      documents: [
        { doc_type: 'license_front', file_url: fileUrl },
        { doc_type: 'license_back', file_url: 'https://cdn.example.com/drivers/lic-back.jpg' },
      ],
    });

    expect(subject).toBe(DOCS_RESUBMIT_SUBJECT);
    expect(html).toContain(fileUrl);
    expect(html).toContain('https://cdn.example.com/drivers/lic-back.jpg');
    expect(html).toContain(DOCS_RESUBMIT_APPROVE_CTA);
    expect(html).toContain('approve?token=tok-abc-123');
    expect(html).toContain(LICENSE_RESUBMIT_CONTEXT);
    expect(html).toContain('Licencia (frente)');
    expect(html).not.toMatch(/>Abrir ficha en admin</);
  });

  test('selectDocsForResubmitEmail expands license pair when one side touched', () => {
    const raw = [
      { doc_type: 'license_front', file_url: 'https://x/f' },
      { doc_type: 'license_back', file_url: 'https://x/b' },
      { doc_type: 'insurance_front', file_url: 'https://x/i' },
    ];
    const selected = selectDocsForResubmitEmail(raw, ['license_front']);
    expect(selected.map((d) => d.doc_type).sort()).toEqual(['license_back', 'license_front']);
  });
});
