-- Migration: convert appointment timestamp columns to TIMESTAMP WITH TIME ZONE
--
-- Root cause of 500 on GET /appointments:
--   appointment_time and end_time were defined as TIMESTAMP (without time zone).
--   The application reads them with Npgsql's GetFieldValue<DateTimeOffset>(), which
--   Npgsql 9 refuses for timestamp-without-tz columns — it throws InvalidCastException.
--   POST /appointments works because it only writes (INSERT) and never reads back those
--   columns with DateTimeOffset.
--
-- Fix: convert to TIMESTAMPTZ so Npgsql 9 can map them to DateTimeOffset correctly.
--   USING … AT TIME ZONE 'UTC' preserves the stored values — the application has always
--   written UTC instants into these columns, so the conversion is lossless.

ALTER TABLE appointments
    ALTER COLUMN appointment_time TYPE TIMESTAMPTZ USING appointment_time AT TIME ZONE 'UTC',
    ALTER COLUMN end_time         TYPE TIMESTAMPTZ USING end_time         AT TIME ZONE 'UTC',
    ALTER COLUMN created_at       TYPE TIMESTAMPTZ USING created_at       AT TIME ZONE 'UTC';
