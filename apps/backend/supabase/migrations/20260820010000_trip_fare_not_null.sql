-- Financial integrity: trips.total_fare / platform_fee / driver_earnings must
-- never be NULL. Backfill any legacy rows, then enforce NOT NULL.
UPDATE trips SET total_fare = 0 WHERE total_fare IS NULL;
UPDATE trips SET platform_fee = 0 WHERE platform_fee IS NULL;
UPDATE trips SET driver_earnings = 0 WHERE driver_earnings IS NULL;

ALTER TABLE trips ALTER COLUMN total_fare SET NOT NULL;
ALTER TABLE trips ALTER COLUMN platform_fee SET NOT NULL;
ALTER TABLE trips ALTER COLUMN driver_earnings SET NOT NULL;
