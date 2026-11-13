import type { DriverDocument } from '../../api/types';
import {
  emptyPreviewCopy,
  partitionReuploadPreview,
  statusBadgeEs,
} from '../../lib/reuploadDocsPreview';

function row(
  partial: Partial<DriverDocument> &
    Pick<DriverDocument, 'id' | 'doc_type' | 'file_url' | 'status'>,
): DriverDocument {
  return {
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('partitionReuploadPreview', () => {
  it('puts active license files in current by side', () => {
    const result = partitionReuploadPreview(
      [
        row({
          id: '1',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/front.jpg',
          status: 'pending_review',
        }),
        row({
          id: '2',
          doc_type: 'license_back',
          file_url: 'https://cdn.example.com/back.jpg',
          status: 'approved',
        }),
        row({
          id: '3',
          doc_type: 'insurance_front',
          file_url: 'https://cdn.example.com/ins.jpg',
          status: 'approved',
        }),
      ],
      'drivers_license',
    );

    expect(result.current.front).toHaveLength(1);
    expect(result.current.front[0]?.fileUrl).toContain('front.jpg');
    expect(result.current.front[0]?.status).toBe('pending_review');
    expect(result.current.back).toHaveLength(1);
    expect(result.current.back[0]?.status).toBe('approved');
    expect(result.previous.front).toHaveLength(0);
    expect(result.hasCurrent).toBe(true);
  });

  it('includes last superseded generation as previous (read-only)', () => {
    const result = partitionReuploadPreview(
      [
        row({
          id: 'old',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/old-front.jpg',
          status: 'superseded',
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: '2026-02-01T12:00:00Z',
        }),
        row({
          id: 'new',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/new-front.jpg',
          status: 'pending_review',
          created_at: '2026-02-01T12:00:01Z',
        }),
      ],
      'drivers_license',
    );

    expect(result.current.front).toHaveLength(1);
    expect(result.current.front[0]?.fileUrl).toContain('new-front');
    expect(result.previous.front).toHaveLength(1);
    expect(result.previous.front[0]?.fileUrl).toContain('old-front');
    expect(result.hasPrevious).toBe(true);
  });

  it('ignores older superseded generations (only latest superseded_at batch)', () => {
    const result = partitionReuploadPreview(
      [
        row({
          id: 'ancient',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/ancient.jpg',
          status: 'superseded',
          created_at: '2025-01-01T00:00:00Z',
          superseded_at: '2025-06-01T00:00:00Z',
        }),
        row({
          id: 'prev',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/prev.jpg',
          status: 'superseded',
          created_at: '2025-06-01T00:00:01Z',
          superseded_at: '2026-01-15T00:00:00Z',
        }),
        row({
          id: 'cur',
          doc_type: 'license_front',
          file_url: 'https://cdn.example.com/cur.jpg',
          status: 'approved',
          created_at: '2026-01-15T00:00:01Z',
        }),
      ],
      'drivers_license',
    );

    expect(result.previous.front.map((f) => f.id)).toEqual(['prev']);
  });
});

describe('emptyPreviewCopy', () => {
  it('does not claim nothing uploaded when server has current files', () => {
    expect(emptyPreviewCopy({ hasServerCurrent: true, hasLocalFiles: false })).toMatch(
      /reemplazar|nuevas/i,
    );
    expect(emptyPreviewCopy({ hasServerCurrent: true, hasLocalFiles: false })).not.toMatch(
      /Todavia no subiste/i,
    );
  });

  it('uses empty local copy only when no server current', () => {
    expect(emptyPreviewCopy({ hasServerCurrent: false, hasLocalFiles: false })).toMatch(
      /Todavia no subiste/i,
    );
  });
});

describe('statusBadgeEs', () => {
  it('maps statuses to ES labels', () => {
    expect(statusBadgeEs('pending_review')).toBe('Pendiente de revisión');
    expect(statusBadgeEs('approved')).toBe('Verificado');
    expect(statusBadgeEs('rejected')).toBe('Rechazado');
    expect(statusBadgeEs('superseded')).toBe('Versión anterior');
  });
});
