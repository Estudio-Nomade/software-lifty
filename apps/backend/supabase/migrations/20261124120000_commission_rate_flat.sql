-- Flat Lifty commission rate (SoT: platform_config.commission_rate).
-- Default 0% launch-safe. Ops sets 0.05 (5%) manually when ready.
-- Keep in sync with src/shared/db/migrations/0065_commission_rate_flat.sql

INSERT INTO "platform_config" ("key", "value")
VALUES ('commission_rate', '0')
ON CONFLICT ("key") DO NOTHING;
