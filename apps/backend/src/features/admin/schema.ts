import { t } from 'elysia';

export const reviewBody = t.Object({
  action: t.String({ enum: ['approve', 'reject'] }),
  notes: t.Optional(t.String({ maxLength: 500 })),
});

export const driverIdParams = t.Object({
  driver_id: t.String(),
});

export const withdrawalsQuery = t.Object({
  status: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const updatePhaseSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  month_start: t.Optional(t.Number({ minimum: 1 })),
  month_end: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
  base_rate: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  monthly_increment: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
  cap_rate: t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 1 }))),
});

export const updateStartDateSchema = t.Object({
  value: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
});
