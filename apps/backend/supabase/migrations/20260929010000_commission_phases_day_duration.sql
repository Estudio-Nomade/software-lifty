-- Commission phases: calendar months → days since commission_start_date.
-- Seed is launch-oriented (week 1 free). Environments still on default month seed get
-- reseeded; custom month ranges are backfilled with 1 month ≈ 30 days before drop.
-- Idempotent: safe if month_* already dropped (re-run / partial apply).

ALTER TABLE "commission_phases" ADD COLUMN IF NOT EXISTS "day_start" integer;
ALTER TABLE "commission_phases" ADD COLUMN IF NOT EXISTS "day_end" integer;
ALTER TABLE "commission_phases" ADD COLUMN IF NOT EXISTS "daily_increment" double precision;

DO $$
DECLARE
  has_month boolean;
  looks_like_default boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commission_phases'
      AND column_name = 'month_start'
  ) INTO has_month;

  IF has_month THEN
    -- Backfill from month_* when present (bridge only).
    UPDATE "commission_phases"
    SET
      "day_start" = COALESCE("day_start", GREATEST(1, (("month_start" - 1) * 30) + 1)),
      "day_end" = CASE
        WHEN "day_end" IS NOT NULL THEN "day_end"
        WHEN "month_end" IS NULL THEN NULL
        ELSE "month_end" * 30
      END,
      "daily_increment" = COALESCE(
        "daily_increment",
        CASE
          WHEN "monthly_increment" IS NULL THEN NULL
          ELSE "monthly_increment" / 30.0
        END
      );

    -- Reseed to week-based launch defaults when still on original month seed shape.
    SELECT EXISTS (
      SELECT 1 FROM "commission_phases" p
      WHERE p.name = 'Lanzamiento' AND p.month_start = 1 AND p.month_end = 1
    ) AND EXISTS (
      SELECT 1 FROM "commission_phases" p
      WHERE p.name = 'Medición' AND p.month_start = 2 AND p.month_end = 2
    ) AND (
      SELECT COUNT(*) FROM "commission_phases"
    ) = 4
    INTO looks_like_default;

    IF looks_like_default THEN
      DELETE FROM "commission_phases";
      INSERT INTO "commission_phases" (name, day_start, day_end, base_rate, daily_increment, cap_rate)
      VALUES
        ('Lanzamiento', 1, 7, 0.00, NULL, NULL),
        ('Medición', 8, 14, 0.05, NULL, NULL),
        ('Estabilización', 15, 120, 0.10, NULL, NULL),
        ('Crecimiento', 121, NULL, 0.10, NULL, 0.15);
    END IF;

    ALTER TABLE "commission_phases" DROP COLUMN IF EXISTS "month_start";
    ALTER TABLE "commission_phases" DROP COLUMN IF EXISTS "month_end";
    ALTER TABLE "commission_phases" DROP COLUMN IF EXISTS "monthly_increment";
  END IF;

  -- Ensure day_start populated (empty/odd DBs or already-migrated).
  UPDATE "commission_phases" SET "day_start" = 1 WHERE "day_start" IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM "commission_phases"
  ) THEN
    INSERT INTO "commission_phases" (name, day_start, day_end, base_rate, daily_increment, cap_rate)
    VALUES
      ('Lanzamiento', 1, 7, 0.00, NULL, NULL),
      ('Medición', 8, 14, 0.05, NULL, NULL),
      ('Estabilización', 15, 120, 0.10, NULL, NULL),
      ('Crecimiento', 121, NULL, 0.10, NULL, 0.15);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commission_phases'
      AND column_name = 'day_start'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "commission_phases" ALTER COLUMN "day_start" SET NOT NULL;
  END IF;
END $$;
