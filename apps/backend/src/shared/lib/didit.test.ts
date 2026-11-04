import { describe, expect, test } from 'bun:test';
import { mapDiditSessionError, redactDiditBody } from './didit';

describe('mapDiditSessionError', () => {
  test('maps credits exhausted to 503 DIDIT_CREDITS_EXHAUSTED', () => {
    const err = mapDiditSessionError(
      400,
      JSON.stringify({
        detail:
          "You don't have enough credits to perform this request. Please top up at https://business.didit.me",
      }),
    );
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('DIDIT_CREDITS_EXHAUSTED');
    expect(err.message).toContain('no está disponible');
  });

  test('maps 401 to DIDIT_UNAUTHORIZED', () => {
    const err = mapDiditSessionError(401, '{"detail":"Invalid API key"}');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DIDIT_UNAUTHORIZED');
  });

  test('maps 403 to DIDIT_UNAUTHORIZED', () => {
    const err = mapDiditSessionError(403, 'forbidden');
    expect(err.code).toBe('DIDIT_UNAUTHORIZED');
  });

  test('maps missing workflow body to DIDIT_WORKFLOW_INVALID', () => {
    const err = mapDiditSessionError(404, '{"detail":"Workflow not found"}');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DIDIT_WORKFLOW_INVALID');
  });

  test('maps generic 500 to DIDIT_SESSION_FAILED', () => {
    const err = mapDiditSessionError(500, '{"detail":"boom"}');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DIDIT_SESSION_FAILED');
  });
});

describe('redactDiditBody', () => {
  test('redacts long tokens and truncates', () => {
    const out = redactDiditBody(`ok ${'a'.repeat(40)} tail`, 80);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('aaaaaaaa');
  });
});
