import { resolveReviewGate } from '../../lib/reviewGate';

describe('resolveReviewGate', () => {
  it('allows WaitingApproval only when step is review', () => {
    expect(resolveReviewGate('review')).toEqual({ ok: true });
  });

  it('blocks when backend still expects documents', () => {
    const result = resolveReviewGate('documents');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Faltan documentos/i);
    }
  });

  it('blocks on unknown or intermediate steps', () => {
    expect(resolveReviewGate('vehicle').ok).toBe(false);
    expect(resolveReviewGate(undefined).ok).toBe(false);
  });
});
