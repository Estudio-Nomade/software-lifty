import type { DriverDocument } from '../../api/types';
import {
  allDocsSatisfied,
  clearSideForReplaceUi,
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

  it('aggregates multiple active rows of the same doc_type', () => {
    const state = hydrateDocsFromApi([
      {
        id: 'a',
        doc_type: 'license_front',
        file_url: 'https://cdn.example.com/1.jpg',
        status: 'pending_review',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'b',
        doc_type: 'license_front',
        file_url: 'https://cdn.example.com/2.jpg',
        status: 'pending_review',
        created_at: '2026-01-01T00:01:00Z',
      },
    ]);
    expect(state.drivers_license.front.uploaded).toBe(true);
    expect(state.drivers_license.front.files).toHaveLength(2);
    expect(state.drivers_license.front.fileName).toBe('2 archivos');
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

  it('surfaces review_comment on the side without forcing needsReplace', () => {
    const state = hydrateDocsFromApi([
      {
        id: 'lf-1',
        doc_type: 'license_front',
        file_url: 'https://cdn.example.com/f.jpg',
        status: 'pending_review',
        created_at: '2026-01-01T00:00:00Z',
        ops_ok: false,
        review_comment: 'Foto borrosa del frente',
      },
    ]);
    expect(state.drivers_license.front.reviewComment).toBe('Foto borrosa del frente');
    expect(state.drivers_license.front.needsReplace).toBe(false);
    expect(state.drivers_license.front.uploaded).toBe(true);
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

describe('clearSideForReplaceUi', () => {
  it('clears pending/approved side so UI and CTA treat it as unsatisfied', () => {
    const pending = {
      ...emptyHydratedDocs().background_check.front,
      uploaded: true,
      serverStatus: 'pending_review' as const,
      fileName: 'PDF cargado',
      fileUrl: 'https://cdn.example.com/a.pdf',
      files: [
        {
          fileUri: null,
          fileName: 'PDF cargado',
          fileUrl: 'https://cdn.example.com/a.pdf',
          isPdf: true,
          serverStatus: 'pending_review' as const,
          reviewComment: null,
        },
      ],
      isPdf: true,
      reviewComment: 'Foto borrosa',
    };

    const cleared = clearSideForReplaceUi(pending);
    expect(cleared.serverStatus).toBeNull();
    expect(cleared.uploaded).toBe(false);
    expect(cleared.files).toEqual([]);
    expect(cleared.fileName).toBeNull();
    expect(cleared.fileUrl).toBeNull();
    expect(cleared.reviewComment).toBeNull();
    expect(sideSatisfied(cleared)).toBe(false);
    expect(
      allDocsSatisfied({
        ...emptyHydratedDocs(),
        background_check: {
          front: cleared,
          back: emptyHydratedDocs().background_check.back,
        },
      }),
    ).toBe(false);
  });

  it('clears approved side the same way as pending_review', () => {
    const approved = {
      ...emptyHydratedDocs().rndg.front,
      uploaded: true,
      serverStatus: 'approved' as const,
      fileName: 'Documento cargado',
      fileUrl: 'https://cdn.example.com/ok.pdf',
      files: [
        {
          fileUri: null,
          fileName: 'Documento cargado',
          fileUrl: 'https://cdn.example.com/ok.pdf',
          isPdf: true,
          serverStatus: 'approved' as const,
          reviewComment: null,
        },
      ],
      isPdf: true,
    };
    const cleared = clearSideForReplaceUi(approved);
    expect(cleared.serverStatus).toBeNull();
    expect(sideSatisfied(cleared)).toBe(false);
  });

  it('keeps rejected rehacer hints without flipping needsReplace', () => {
    const rejected = {
      ...emptyHydratedDocs().rndg.front,
      needsReplace: true,
      serverStatus: 'rejected' as const,
      fileName: 'Rehacer',
      fileUrl: 'https://cdn.example.com/old.pdf',
      files: [
        {
          fileUri: null,
          fileName: 'Rehacer',
          fileUrl: 'https://cdn.example.com/old.pdf',
          isPdf: true,
          serverStatus: 'rejected' as const,
          reviewComment: null,
        },
      ],
    };

    const cleared = clearSideForReplaceUi(rejected);
    expect(cleared.needsReplace).toBe(true);
    expect(cleared.serverStatus).toBe('rejected');
    expect(cleared.fileName).toBe('Rehacer');
    expect(cleared.files).toHaveLength(1);
    expect(sideSatisfied(cleared)).toBe(false);
  });
});
