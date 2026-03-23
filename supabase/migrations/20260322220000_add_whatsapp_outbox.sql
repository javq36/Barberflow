-- Migration: add WhatsApp outbox, customer opt-in, and appointment reminder tracking
-- Supports Phase 1 of the whatsapp-phase1 SDD change.
--
-- 1. whatsapp_outbox     — durable outbox for at-least-once WhatsApp delivery via Twilio
-- 2. customers.opt_in_whatsapp — consent gate; default TRUE (opt-in by default, WhatsApp is core feature)
-- 3. appointments.reminder_sent_at — deduplication guard for 24h reminder worker

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. whatsapp_outbox table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id       UUID NOT NULL REFERENCES barbershops(id),
    customer_phone      VARCHAR(20) NOT NULL,
    template_name       VARCHAR(100) NOT NULL,
    template_variables  JSONB NOT NULL DEFAULT '{}',
    -- Status: 0=Pending, 1=Processing, 2=Sent, 3=Failed
    status              INTEGER NOT NULL DEFAULT 0,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,
    last_error          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    next_retry_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for the outbox processor: only scans rows that are actually
-- Pending (status = 0) ordered by their next eligible retry time.
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON whatsapp_outbox (next_retry_at)
    WHERE status = 0;

-- Composite index used by monitoring queries and the AppointmentReminderService
-- when it checks existing reminder rows per barbershop.
CREATE INDEX IF NOT EXISTS idx_outbox_barbershop
    ON whatsapp_outbox (barbershop_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. customers.opt_in_whatsapp
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS opt_in_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. appointments.reminder_sent_at
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
