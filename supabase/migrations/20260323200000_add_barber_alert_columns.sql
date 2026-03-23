-- Migration: add barber alert columns for WhatsApp Phase 3A
-- Follows the same pattern as reminder_sent_at on appointments.

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS barber_alert_sent_at TIMESTAMPTZ NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_agenda_sent_date DATE NULL;
