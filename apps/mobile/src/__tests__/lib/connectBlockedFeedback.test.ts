import { ApiError } from '../../api/types';
import {
  feedbackForConnectBlock,
  feedbackFromConnectError,
} from '../../lib/connectBlockedFeedback';

describe('connectBlockedFeedback', () => {
  it('maps local blockers to polished Spanish copy', () => {
    expect(feedbackForConnectBlock('not_approved')).toMatchObject({
      title: 'Aún no podés conectarte',
      tone: 'warning',
    });
    expect(feedbackForConnectBlock('docs_pending').title).toBe('Documentos en revisión');
    expect(feedbackForConnectBlock('no_location').title).toBe('Falta tu ubicación');
  });

  it('maps DRIVER_NOT_APPROVED API errors without raw backend string', () => {
    const err = new ApiError({
      error: {
        code: 'DRIVER_NOT_APPROVED',
        message: 'Todavia no estas aprobado para conectarte.',
        status: 403,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    const feedback = feedbackFromConnectError(err);
    expect(feedback.title).toBe('Aún no podés conectarte');
    expect(feedback.message).toMatch(/revisión/i);
    expect(feedback.message).not.toMatch(/Todavia no estas/i);
    expect(feedback.tone).toBe('warning');
  });

  it('falls back for unknown errors', () => {
    const feedback = feedbackFromConnectError(new Error('boom'));
    expect(feedback.title).toBe('No se pudo conectar');
    expect(feedback.message).toBe('boom');
    expect(feedback.tone).toBe('error');
  });
});
