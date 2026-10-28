import { t } from 'elysia';

export const reviewBody = t.Object({
  action: t.String({ enum: ['approve', 'reject', 'request_changes'] }),
  notes: t.Optional(t.String({ maxLength: 500 })),
  reject_doc_types: t.Optional(t.Array(t.String())),
});

export const driverIdParams = t.Object({
  driver_id: t.String(),
});

export const documentIdParams = t.Object({
  driver_id: t.String(),
  document_id: t.String(),
});

/** Per-document ops review (OK tick + optional fix request). */
export const patchDocumentReviewBody = t.Object({
  ops_ok: t.Optional(t.Boolean()),
  review_comment: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  request_fix: t.Optional(t.Boolean()),
});

export const updatePhaseSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  day_start: t.Optional(t.Number({ minimum: 1 })),
  day_end: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
  base_rate: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  daily_increment: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
  cap_rate: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
});

export const updateStartDateSchema = t.Object({
  value: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
});

export const dashboardSummaryQuery = t.Object({
  range: t.Optional(t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d')])),
});

export const driverTripsQuery = t.Object({
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
  status: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const adminTripsQuery = t.Object({
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
  status: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  driver_id: t.Optional(t.String()),
  district_id: t.Optional(t.String()),
  q: t.Optional(t.String()),
});

export const tripIdParams = t.Object({
  trip_id: t.String(),
});

export const updatePayoutAccountSchema = t.Object({
  alias: t.Optional(t.String({ maxLength: 120 })),
  cvu: t.Optional(t.String({ maxLength: 40 })),
  holder: t.Optional(t.String({ maxLength: 120 })),
  bank: t.Optional(t.String({ maxLength: 120 })),
});

export const commissionReceiptsQuery = t.Object({
  status: t.Optional(t.String()),
  driver_id: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
});

export const receiptIdParams = t.Object({
  id: t.String(),
});

export const rejectFraudBody = t.Object({
  note: t.Optional(t.String({ maxLength: 500 })),
});
