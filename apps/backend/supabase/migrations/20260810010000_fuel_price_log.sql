CREATE TABLE IF NOT EXISTS "fuel_price_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "price" double precision NOT NULL,
  "updated_by" varchar(255) NOT NULL,
  "source" varchar(255),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "fuel_price_log" (price, updated_by, source, notes)
VALUES (2100, 'system-seed', 'valor inicial de referencia', NULL);
