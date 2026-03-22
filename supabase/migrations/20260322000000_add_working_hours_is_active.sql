-- Migration: add is_active to working_hours
-- The working_hours table was created without an is_active column.
-- This column allows soft-disabling a day without deleting the row,
-- which is used by the Working Hours management UI to toggle days on/off.

ALTER TABLE working_hours
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Add a unique constraint on (barber_id, day_of_week) to support
-- INSERT ON CONFLICT upserts in WorkingHoursService.UpsertAsync.
-- This ensures each barber has at most one block per weekday.
ALTER TABLE working_hours
    ADD CONSTRAINT uq_working_hours_barber_day
    UNIQUE (barber_id, day_of_week);
