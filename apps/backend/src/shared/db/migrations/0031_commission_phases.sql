CREATE TABLE IF NOT EXISTS "commission_phases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(50) NOT NULL,
  "month_start" integer NOT NULL,
  "month_end" integer,
  "base_rate" double precision DEFAULT 0 NOT NULL,
  "monthly_increment" double precision,
  "cap_rate" double precision,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
