import { t } from 'elysia';

export const issueIdentificationBody = t.Object({
  driver_id: t.String({ format: 'uuid' }),
  issued_at: t.Optional(t.String()),
  external_ref: t.Optional(t.String({ maxLength: 255 })),
  district_id: t.Optional(t.String({ format: 'uuid' })),
});

export type IssueIdentificationBody = {
  driver_id: string;
  issued_at?: string;
  external_ref?: string;
  district_id?: string;
};
