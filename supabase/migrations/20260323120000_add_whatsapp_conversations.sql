-- Migration: add whatsapp_conversations for AI-powered booking (Phase 2A)
-- Stores per-customer conversation history as a JSONB messages array,
-- keyed by (barbershop_id, phone). Context field reserved for future
-- structured state (selected barber, service, date preferences).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. whatsapp_conversations table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id   UUID NOT NULL REFERENCES barbershops(id),
    phone           VARCHAR(20) NOT NULL,
    role            VARCHAR(10) NOT NULL DEFAULT 'customer',
    messages        JSONB NOT NULL DEFAULT '[]',
    context         JSONB NOT NULL DEFAULT '{}',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(barbershop_id, phone)
);

-- Supports fast lookups by phone across the activity window
-- (e.g. 30-minute expiry check, rate limiting by phone).
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_phone_last
    ON whatsapp_conversations (phone, last_message_at DESC);
