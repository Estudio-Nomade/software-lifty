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
