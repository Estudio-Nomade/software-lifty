import type { DriverDocument } from '../../api/types';
import {
  allDocsSatisfied,
  DOC_SIDES,
  type DocBase,
  emptyHydratedDocs,
  hydrateDocsFromApi,
  sideSatisfied,
} from '../../lib/onboardingDocsHydrate';

function doc(
  doc_type: DriverDocument['doc_type'],
  status: DriverDocument['status'],
  file_url = 'https://cdn.example.com/f.jpg',
): DriverDocument {
  return {
    id: `${doc_type}-id`,
    doc_type,
    file_url,
    status,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('hydrateDocsFromApi', () => {
  it('marks approved and pending_review as uploaded OK', () => {
    const state = hydrateDocsFromApi([
      doc('license_front', 'approved'),
      doc('license_back', 'pending_review'),
      doc('platform_rc_insurance_front', 'pending_review', 'https://cdn.example.com/rc.pdf'),
    ]);

    expect(state.drivers_license.front.uploaded).toBe(true);
    expect(state.drivers_license.front.serverStatus).toBe('approved');
    expect(state.drivers_license.front.needsReplace).toBe(false);
    expect(state.drivers_license.back.uploaded).toBe(true);
    expect(state.platform_rc_insurance.front.uploaded).toBe(true);
    expect(state.platform_rc_insurance.front.isPdf).toBe(true);
    expect(state.platform_rc_insurance.front.fileName).toBe('PDF cargado');
    expect(state.vehicle_insurance.front.uploaded).toBe(false);
  });

  it('marks rejected as needsReplace (not satisfied)', () => {
    const state = hydrateDocsFromApi([doc('platform_rc_insurance_front', 'rejected')]);
    expect(state.platform_rc_insurance.front.needsReplace).toBe(true);
    expect(state.platform_rc_insurance.front.uploaded).toBe(false);
    expect(sideSatisfied(state.platform_rc_insurance.front)).toBe(false);
  });

  it('ignores superseded rows', () => {
    const state = hydrateDocsFromApi([
      doc('license_front', 'superseded'),
      doc('license_front', 'approved'),
    ]);
    // last non-superseded wins in loop order; both processed but superseded skipped
    expect(state.drivers_license.front.serverStatus).toBe('approved');
  });
});

describe('sideSatisfied / allDocsSatisfied', () => {
  it('session replace satisfies a rejected side', () => {
    const side = {
      ...emptyHydratedDocs().platform_rc_insurance.front,
      needsReplace: true,
      serverStatus: 'rejected' as const,
      replacedInSession: true,
      uploaded: true,
    };
    expect(sideSatisfied(side)).toBe(true);
  });

  it('allDocsSatisfied true when every required side is OK from server', () => {
    const rows: DriverDocument[] = [];
    for (const base of Object.keys(DOC_SIDES) as DocBase[]) {
      for (const side of DOC_SIDES[base]) {
        const backend =
          base === 'drivers_license'
            ? `license_${side}`
            : base === 'vehicle_registration'
              ? `registration_${side}`
              : base === 'vehicle_insurance'
                ? 'insurance_front'
                : base === 'platform_rc_insurance'
                  ? 'platform_rc_insurance_front'
                  : base === 'background_check'
                    ? 'background_check_front'
                    : 'rndg_front';
        rows.push(doc(backend as DriverDocument['doc_type'], 'pending_review'));
      }
    }
    const state = hydrateDocsFromApi(rows);
    expect(allDocsSatisfied(state)).toBe(true);
  });

  it('allDocsSatisfied false when one side missing', () => {
    const state = emptyHydratedDocs();
    expect(allDocsSatisfied(state)).toBe(false);
  });
});
