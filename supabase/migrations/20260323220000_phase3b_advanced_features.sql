-- Phase 3B Advanced Features Migration
-- Adds: preferred_barber_id on customers, feedback_requested_at on appointments,
--       appointment_feedback table, conversation_analytics table.

-- 1. Preferred barber preference stored on the customer record.
ALTER TABLE customers
    ADD COLUMN preferred_barber_id UUID REFERENCES users(id) NULL;

-- 2. Tracks when the feedback WhatsApp message was sent for a completed appointment.
ALTER TABLE appointments
    ADD COLUMN feedback_requested_at TIMESTAMPTZ NULL;

-- 3. Stores 1-5 star ratings submitted by customers after their appointment.
CREATE TABLE appointment_feedback (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID         NOT NULL UNIQUE REFERENCES appointments(id),
    rating         INT          NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment        TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Per-conversation analytics row, keyed by conversation_id.
CREATE TABLE conversation_analytics (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID        NOT NULL UNIQUE REFERENCES whatsapp_conversations(id),
    barbershop_id    UUID        NOT NULL REFERENCES barbershops(id),
    messages_count   INT         NOT NULL DEFAULT 0,
    tools_used       TEXT[]      NOT NULL DEFAULT '{}',
    booking_completed BOOLEAN    NOT NULL DEFAULT false,
    total_response_ms BIGINT     NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversation_analytics_barbershop_updated
    ON conversation_analytics(barbershop_id, updated_at);
