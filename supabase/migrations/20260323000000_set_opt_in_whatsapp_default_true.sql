-- Migration: change opt_in_whatsapp default to true and opt in existing customers
--
-- WhatsApp notifications are the core feature of BarberFlow.
-- All customers should receive them unless they explicitly opt out.
--
-- This migration:
--   1. Changes the column default from FALSE to TRUE so all new customers are opted in.
--   2. Updates existing customers who still have the old FALSE default to TRUE.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Change column default
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customers ALTER COLUMN opt_in_whatsapp SET DEFAULT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Opt in all existing customers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE customers SET opt_in_whatsapp = TRUE WHERE opt_in_whatsapp = FALSE;
