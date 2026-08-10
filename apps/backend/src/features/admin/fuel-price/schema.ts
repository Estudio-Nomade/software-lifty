import { t } from 'elysia';

export const setFuelPriceBody = t.Object({
  price: t.Number({ minimum: 1 }),
  source: t.Optional(t.String({ maxLength: 255 })),
  notes: t.Optional(t.String({ maxLength: 1000 })),
  force: t.Optional(t.Boolean()),
});
