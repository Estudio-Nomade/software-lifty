CREATE TABLE IF NOT EXISTS "commission_phases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(50) NOT NULL,
  "month_start" integer NOT NULL,
  "month_end" integer,
  "base_rate" double precision NOT NULL DEFAULT 0,
  "monthly_increment" double precision,
  "cap_rate" double precision,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "platform_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) UNIQUE NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO "commission_phases" (name, month_start, month_end, base_rate, monthly_increment, cap_rate)
VALUES
  ('Lanzamiento', 1, 1, 0.00, NULL, NULL),
  ('Medición', 2, 2, 0.05, NULL, NULL),
  ('Estabilización', 3, 6, 0.10, NULL, NULL),
  ('Crecimiento', 7, NULL, 0.10, 0.007, 0.15);

INSERT INTO "platform_config" ("key", "value")
VALUES ('commission_start_date', '2026-10-01')
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "drivers" DROP COLUMN IF EXISTS "commission_exempt_until";
