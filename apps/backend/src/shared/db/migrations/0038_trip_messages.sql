CREATE TABLE IF NOT EXISTS "trip_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "users"("id"),
  "sender_role" varchar(20) NOT NULL,
  "text" varchar(1000) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "trip_messages_trip_id_idx" ON "trip_messages" ("trip_id", "created_at");
