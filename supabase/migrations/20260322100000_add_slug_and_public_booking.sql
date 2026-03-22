-- Migration: add slug, buffer_minutes, booking_rules unique constraint, and performance indexes
-- Supports T09 of the appointment-scheduling-web change.
--
-- 1. barbershops.slug         — unique public identifier for each barbershop
-- 2. booking_rules.buffer_minutes — buffer time between appointments (DEFAULT 10)
-- 3. booking_rules UNIQUE (barbershop_id) — required for ON CONFLICT upserts
-- 4. customers phone+barbershop unique index — required for public find-or-create upsert
-- 5. Performance indexes for AvailabilityService queries

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. barbershops.slug
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE barbershops
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Auto-generate slugs for existing rows from the barbershop name:
--   lower-case, replace non-alphanumeric runs with '-', trim leading/trailing dashes.
DO $$
DECLARE
    rec     RECORD;
    base    VARCHAR(100);
    candidate VARCHAR(104);  -- base + '-' + up to 3-digit suffix
    suffix  INT;
BEGIN
    FOR rec IN
        SELECT id, name FROM barbershops WHERE slug IS NULL ORDER BY created_at
    LOOP
        -- Build base slug: lowercase, collapse non-alnum runs to '-', trim edge dashes
        base := LOWER(
                    TRIM(BOTH '-' FROM
                        REGEXP_REPLACE(TRIM(rec.name), '[^a-zA-Z0-9]+', '-', 'g')
                    )
                );

        -- Truncate to 95 chars to leave room for a numeric suffix
        base := LEFT(base, 95);

        -- Find a unique slug; start with the base, then append -1, -2, …
        candidate := base;
        suffix    := 0;

        WHILE EXISTS (SELECT 1 FROM barbershops WHERE slug = candidate) LOOP
            suffix    := suffix + 1;
            candidate := base || '-' || suffix::TEXT;
        END LOOP;

        UPDATE barbershops SET slug = candidate WHERE id = rec.id;
    END LOOP;
END;
$$;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE barbershops
    ALTER COLUMN slug SET NOT NULL;

-- Unique index — also used for fast slug lookups in public endpoints
CREATE UNIQUE INDEX IF NOT EXISTS idx_barbershops_slug
    ON barbershops (slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. booking_rules.buffer_minutes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE booking_rules
    ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. booking_rules UNIQUE constraint on barbershop_id
--    Required so BookingRulesService can use ON CONFLICT (barbershop_id) DO UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_booking_rules_barbershop_id'
    ) THEN
        ALTER TABLE booking_rules
            ADD CONSTRAINT uq_booking_rules_barbershop_id UNIQUE (barbershop_id);
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. customers: unique index on (phone, barbershop_id)
--    Enables find-or-create upsert: INSERT … ON CONFLICT (barbershop_id, phone) DO UPDATE
--    Only index rows where phone IS NOT NULL (walk-in customers may have no phone).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_barbershop
    ON customers (barbershop_id, phone)
    WHERE phone IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Performance indexes for AvailabilityService
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Appointments: composite index on (barber_id, appointment_time) for busy-range queries.
--     Partial: exclude cancelled appointments (status = 3) since AvailabilityService
--     queries WHERE status IN (1, 2).
CREATE INDEX IF NOT EXISTS idx_appointments_barber_time
    ON appointments (barber_id, appointment_time, end_time)
    WHERE status IN (1, 2);

-- 5b. Working hours: composite index on (barber_id, day_of_week) for schedule lookup.
--     Partial: only active rows (is_active = TRUE), matching WorkingHoursService queries.
CREATE INDEX IF NOT EXISTS idx_working_hours_barber_day
    ON working_hours (barber_id, day_of_week)
    WHERE is_active = TRUE;

-- 5c. Time off: composite index for date-range overlap checks.
CREATE INDEX IF NOT EXISTS idx_time_off_barber_dates
    ON time_off (barber_id, start_date, end_date);
