import type { DriverDocument } from '../../api/types';
import {
  licenseDocRowPresentation,
  type ProfessionalLicensePhase,
} from '../../lib/profileLicenseDocRow';

function doc(status: DriverDocument['status']): DriverDocument {
  return {
    id: 'x',
    doc_type: 'license_front',
    file_url: 'https://cdn.example.com/f.jpg',
    status,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('licenseDocRowPresentation', () => {
  it('uses stable label Licencia de conducir (never Carnet profesional as title)', () => {
    const row = licenseDocRowPresentation({
      docsFor: [doc('approved')],
      professionalCopy: 'Pendiente de carga — quedan 12 días',
      professionalPhase: 'grace',
    });
    expect(row.label).toBe('Licencia de conducir');
    expect(row.label).not.toMatch(/Carnet/i);
  });

  it('CTA is Volver a subir when license docs exist', () => {
    const row = licenseDocRowPresentation({
      docsFor: [doc('pending_review')],
      professionalCopy: 'Pendiente de carga — quedan 12 días',
      professionalPhase: 'grace',
    });
    expect(row.cta).toBe('Volver a subir');
  });

  it('CTA is Subir when no license docs', () => {
    const row = licenseDocRowPresentation({
      docsFor: [],
      professionalCopy: 'Carnet profesional pendiente de carga',
      professionalPhase: 'not_started',
    });
    expect(row.cta).toBe('Subir');
  });

  it('prefers professional grace copy as status when present', () => {
    const row = licenseDocRowPresentation({
      docsFor: [doc('approved')],
      professionalCopy: 'Pendiente de carga — quedan 5 días (vence 01/01/2027)',
      professionalPhase: 'grace',
    });
    expect(row.status).toContain('Pendiente de carga');
    expect(row.icon).toBe('time');
  });

  it('uses overdue icon/tone when professional phase is overdue', () => {
    const row = licenseDocRowPresentation({
      docsFor: [doc('approved')],
      professionalCopy: 'Plazo vencido — presentá el carnet o contactá soporte',
      professionalPhase: 'overdue' satisfies ProfessionalLicensePhase,
    });
    expect(row.icon).toBe('alert');
    expect(row.statusTone).toBe('danger');
  });

  it('falls back to docs status when no professional copy', () => {
    const row = licenseDocRowPresentation({
      docsFor: [doc('rejected')],
      professionalCopy: null,
      professionalPhase: null,
    });
    expect(row.status).toBe('Rechazado');
    expect(row.icon).toBe('close');
    expect(row.cta).toBe('Volver a subir');
  });
});
