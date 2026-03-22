-- =============================================================================
-- BarberFlow — Development Seed Data
-- =============================================================================
-- WARNING: This file is for LOCAL DEVELOPMENT ONLY.
--          Do NOT apply to production.
--
-- Dev password for all users: Dev123456!
-- BCrypt hash (cost 11, $2b$11$): $2b$11$IQj1ExQltvU25A96ZCTjfePhOU48/MqWIHPGXTyDWPONtH5l1dJwW
--
-- Idempotent: uses ON CONFLICT DO NOTHING on every INSERT.
-- Re-running this file after a db reset is safe.
--
-- Hardcoded UUIDs used throughout so foreign keys are stable across runs.
-- =============================================================================


-- ==================== BARBERSHOP ====================

INSERT INTO barbershops (id, name, phone, address, timezone, slug, created_at)
VALUES (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'BarberFlow Demo',
    '+573001234567',
    'Calle 85 #15-20, Bogotá, Colombia',
    'America/Bogota',
    'barberflow-demo',
    NOW()
)
ON CONFLICT DO NOTHING;


-- ==================== USERS ====================
-- role: 1 = SuperAdmin | 2 = Owner | 3 = Barber | 4 = Customer
-- password_hash is BCrypt cost-11 of "Dev123456!"

-- Owner
INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
VALUES (
    'a1b2c3d4-0002-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Carlos Administrador',
    'owner@barberflow.dev',
    '+573001000001',
    2,
    '$2b$11$IQj1ExQltvU25A96ZCTjfePhOU48/MqWIHPGXTyDWPONtH5l1dJwW',
    TRUE,
    NOW()
)
ON CONFLICT DO NOTHING;

-- Barber 1 — Miguel
INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
VALUES (
    'a1b2c3d4-0002-0002-0002-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Miguel Barbero',
    'miguel@barberflow.dev',
    '+573002000002',
    3,
    '$2b$11$IQj1ExQltvU25A96ZCTjfePhOU48/MqWIHPGXTyDWPONtH5l1dJwW',
    TRUE,
    NOW()
)
ON CONFLICT DO NOTHING;

-- Barber 2 — Andrés
INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
VALUES (
    'a1b2c3d4-0002-0003-0003-000000000003',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Andrés Barbero',
    'andres@barberflow.dev',
    '+573003000003',
    3,
    '$2b$11$IQj1ExQltvU25A96ZCTjfePhOU48/MqWIHPGXTyDWPONtH5l1dJwW',
    TRUE,
    NOW()
)
ON CONFLICT DO NOTHING;


-- ==================== SERVICES ====================
-- Prices in Colombian Pesos (COP).

INSERT INTO services (id, barbershop_id, name, duration_minutes, price, active)
VALUES
    (
        'a1b2c3d4-0003-0001-0001-000000000001',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'Corte de Cabello',
        30,
        30000.00,
        TRUE
    ),
    (
        'a1b2c3d4-0003-0002-0002-000000000002',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'Arreglo de Barba',
        20,
        20000.00,
        TRUE
    ),
    (
        'a1b2c3d4-0003-0003-0003-000000000003',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'Corte + Barba',
        45,
        50000.00,
        TRUE
    )
ON CONFLICT DO NOTHING;


-- ==================== WORKING HOURS ====================
-- Mon–Sat (day_of_week 1–6), 09:00–19:00, for both barbers.
-- Sunday (0) is omitted → barbers are off on Sunday.
-- Unique constraint (barber_id, day_of_week) prevents duplicates on re-run.

-- Miguel — Monday to Saturday
INSERT INTO working_hours (id, barber_id, day_of_week, start_time, end_time, is_active)
VALUES
    ('a1b2c3d4-0004-0001-0001-000000000001', 'a1b2c3d4-0002-0002-0002-000000000002', 1, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0001-0002-000000000002', 'a1b2c3d4-0002-0002-0002-000000000002', 2, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0001-0003-000000000003', 'a1b2c3d4-0002-0002-0002-000000000002', 3, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0001-0004-000000000004', 'a1b2c3d4-0002-0002-0002-000000000002', 4, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0001-0005-000000000005', 'a1b2c3d4-0002-0002-0002-000000000002', 5, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0001-0006-000000000006', 'a1b2c3d4-0002-0002-0002-000000000002', 6, '09:00', '19:00', TRUE)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Andrés — Monday to Saturday
INSERT INTO working_hours (id, barber_id, day_of_week, start_time, end_time, is_active)
VALUES
    ('a1b2c3d4-0004-0002-0001-000000000007', 'a1b2c3d4-0002-0003-0003-000000000003', 1, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0002-0002-000000000008', 'a1b2c3d4-0002-0003-0003-000000000003', 2, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0002-0003-000000000009', 'a1b2c3d4-0002-0003-0003-000000000003', 3, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0002-0004-000000000010', 'a1b2c3d4-0002-0003-0003-000000000003', 4, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0002-0005-000000000011', 'a1b2c3d4-0002-0003-0003-000000000003', 5, '09:00', '19:00', TRUE),
    ('a1b2c3d4-0004-0002-0006-000000000012', 'a1b2c3d4-0002-0003-0003-000000000003', 6, '09:00', '19:00', TRUE)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;


-- ==================== BOOKING RULES ====================
-- Unique constraint on barbershop_id enables ON CONFLICT upsert.

INSERT INTO booking_rules (
    id,
    barbershop_id,
    min_notice_minutes,
    max_days_in_future,
    slot_interval_minutes,
    buffer_minutes
)
VALUES (
    'a1b2c3d4-0005-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    60,   -- 1 hour minimum notice before booking
    30,   -- can book up to 30 days in advance
    30,   -- availability slots every 30 minutes
    10    -- 10-minute buffer between appointments
)
ON CONFLICT (barbershop_id) DO NOTHING;


-- ==================== CUSTOMER (WhatsApp testing) ====================

INSERT INTO customers (
    id,
    barbershop_id,
    name,
    phone,
    email,
    notes,
    active,
    opt_in_whatsapp,
    created_at
)
VALUES (
    'a1b2c3d4-0006-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Cliente Test WhatsApp',
    '+573224760877',
    'test.whatsapp@barberflow.dev',
    'Cuenta de prueba para validar envío de mensajes por WhatsApp.',
    TRUE,
    TRUE,
    NOW()
)
ON CONFLICT DO NOTHING;
