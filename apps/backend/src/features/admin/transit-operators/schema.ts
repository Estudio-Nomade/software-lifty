import { t } from 'elysia';

export const createTransitOperatorBody = t.Object({
  district_id: t.String({ format: 'uuid' }),
  email: t.String({ minLength: 3, maxLength: 255 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
  full_name: t.Optional(t.String({ maxLength: 255 })),
});

export const patchTransitOperatorBody = t.Object({
  district_id: t.Optional(t.String({ format: 'uuid' })),
  full_name: t.Optional(t.String({ maxLength: 255 })),
});

export const resetPasswordBody = t.Object({
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const userIdParams = t.Object({
  userId: t.String({ format: 'uuid' }),
});
