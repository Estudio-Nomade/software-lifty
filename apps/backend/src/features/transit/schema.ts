import { t } from 'elysia';

export const transitDriverIdParams = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const transitIssueBody = t.Object({
  issued_at: t.Optional(t.String()),
  external_ref: t.Optional(t.String({ maxLength: 255 })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
  district_id: t.Optional(t.String({ format: 'uuid' })),
  /** Alias for external_ref (UI batch field). */
  batch: t.Optional(t.String({ maxLength: 255 })),
});

export type TransitIssueBody = {
  issued_at?: string;
  external_ref?: string;
  notes?: string;
  district_id?: string;
  batch?: string;
};
