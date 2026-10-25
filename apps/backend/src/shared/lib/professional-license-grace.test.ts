import { describe, expect, test } from 'bun:test';
import {
  PROFESSIONAL_LICENSE_GRACE_DAYS,
  buildGraceStartPatch,
  evaluateProfessionalLicenseGrace,
  resolveLicenseProfessionalStatus,
  shouldClearProfessionalGraceTimestamps,
  shouldStartProfessionalLicenseGrace,
} from './professional-license-grace';

describe('professional-license-grace', () => {
  const t0 = new Date('2026-10-24T12:00:00.000Z');

  test('shouldStart only on first online while pending_professional', () => {
    expect(
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: true,
        license_professional_status: 'pending_professional',
        professional_license_grace_started_at: null,
      }),
    ).toBe(true);

    expect(
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: true,
        license_professional_status: 'pending_professional',
        professional_license_grace_started_at: t0,
      }),
    ).toBe(false);

    expect(
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: false,
        license_professional_status: 'pending_professional',
        professional_license_grace_started_at: null,
      }),
    ).toBe(false);

    expect(
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: true,
        license_professional_status: 'professional',
        professional_license_grace_started_at: null,
      }),
    ).toBe(false);
  });

  test('shouldStart false when started already set (concurrent second writer)', () => {
    expect(
      shouldStartProfessionalLicenseGrace({
        isGoingOnline: true,
        license_professional_status: 'pending_professional',
        professional_license_grace_started_at: t0,
      }),
    ).toBe(false);
  });

  test('shouldClearProfessionalGraceTimestamps only pending → professional/not_required', () => {
    expect(shouldClearProfessionalGraceTimestamps('pending_professional', 'professional')).toBe(
      true,
    );
    expect(shouldClearProfessionalGraceTimestamps('pending_professional', 'not_required')).toBe(
      true,
    );
    expect(
      shouldClearProfessionalGraceTimestamps('pending_professional', 'pending_professional'),
    ).toBe(false);
    expect(shouldClearProfessionalGraceTimestamps('professional', 'professional')).toBe(false);
    expect(shouldClearProfessionalGraceTimestamps('professional', 'not_required')).toBe(false);
    expect(shouldClearProfessionalGraceTimestamps('not_required', 'pending_professional')).toBe(
      false,
    );
    expect(shouldClearProfessionalGraceTimestamps(null, 'professional')).toBe(false);
  });

  test('buildGraceStartPatch is +60 days', () => {
    const patch = buildGraceStartPatch(t0);
    expect(patch.professional_license_grace_started_at.toISOString()).toBe(t0.toISOString());
    const due = patch.professional_license_due_at.getTime() - t0.getTime();
    expect(due).toBe(PROFESSIONAL_LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  });

  test('evaluate not_started pending before first online', () => {
    const snap = evaluateProfessionalLicenseGrace({
      license_category: 'B',
      license_professional_status: 'pending_professional',
      now: t0,
    });
    expect(snap.phase).toBe('not_started');
    expect(snap.show_banner).toBe(true);
    expect(snap.blocks_online).toBe(false);
    expect(snap.days_remaining).toBe(60);
  });

  test('evaluate grace mid-window', () => {
    const started = t0;
    const now = new Date(t0.getTime() + 10 * 24 * 60 * 60 * 1000);
    const snap = evaluateProfessionalLicenseGrace({
      license_professional_status: 'pending_professional',
      professional_license_grace_started_at: started,
      professional_license_due_at: new Date(started.getTime() + 60 * 24 * 60 * 60 * 1000),
      now,
    });
    expect(snap.phase).toBe('grace');
    expect(snap.days_elapsed).toBe(10);
    expect(snap.days_remaining).toBe(50);
    expect(snap.blocks_online).toBe(false);
  });

  test('evaluate overdue day 61 still no hard-block v1', () => {
    const started = t0;
    const now = new Date(t0.getTime() + 61 * 24 * 60 * 60 * 1000);
    const snap = evaluateProfessionalLicenseGrace({
      license_professional_status: 'pending_professional',
      professional_license_grace_started_at: started,
      professional_license_due_at: new Date(started.getTime() + 60 * 24 * 60 * 60 * 1000),
      now,
    });
    expect(snap.phase).toBe('overdue');
    expect(snap.days_remaining).toBe(0);
    expect(snap.blocks_online).toBe(false);
    expect(snap.show_banner).toBe(true);
  });

  test('resolveLicenseProfessionalStatus moto A3 → not_required', () => {
    expect(
      resolveLicenseProfessionalStatus({ vehicle_type: 'motorcycle', license_category: 'A3' }),
    ).toBe('not_required');
    expect(resolveLicenseProfessionalStatus({ vehicle_type: 'moto', license_category: 'a3' })).toBe(
      'not_required',
    );
  });

  test('resolveLicenseProfessionalStatus auto B → pending_professional', () => {
    expect(resolveLicenseProfessionalStatus({ vehicle_type: 'car', license_category: 'B' })).toBe(
      'pending_professional',
    );
    expect(
      resolveLicenseProfessionalStatus({ vehicle_type: 'car', license_category: 'professional' }),
    ).toBe('professional');
  });

  test('resolveLicenseProfessionalStatus A3 + null vehicle → unknown (no false pending)', () => {
    expect(resolveLicenseProfessionalStatus({ vehicle_type: null, license_category: 'A3' })).toBe(
      'unknown',
    );
    expect(
      resolveLicenseProfessionalStatus({ vehicle_type: undefined, license_category: 'B' }),
    ).toBe('unknown');
    expect(resolveLicenseProfessionalStatus({ vehicle_type: '', license_category: 'A3' })).toBe(
      'unknown',
    );
  });
});
