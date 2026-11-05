-- trips.passenger_id is a users.id (not drivers.id). Add the missing FK.
-- ON DELETE SET NULL keeps trip history if a user row is ever removed.
-- NOT VALID enforces the FK for new/updated rows without failing on legacy orphans;
-- we then VALIDATE only when there are no orphans (otherwise it stays NOT VALID and
-- ops can clean orphans and run: ALTER TABLE trips VALIDATE CONSTRAINT trips_passenger_id_users_id_fk;).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_passenger_id_users_id_fk'
  ) THEN
    ALTER TABLE "trips"
      ADD CONSTRAINT "trips_passenger_id_users_id_fk"
      FOREIGN KEY ("passenger_id") REFERENCES "users" ("id") ON DELETE SET NULL NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_passenger_id_users_id_fk' AND NOT convalidated
  ) THEN
    IF EXISTS (
      SELECT 1 FROM trips t
      WHERE t.passenger_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.passenger_id)
    ) THEN
      RAISE NOTICE 'trips.passenger_id has orphan rows; FK left NOT VALID (new rows are still enforced)';
    ELSE
      ALTER TABLE "trips" VALIDATE CONSTRAINT "trips_passenger_id_users_id_fk";
    END IF;
  END IF;
END $$;
