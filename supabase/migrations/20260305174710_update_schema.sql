-- Enable UUID generation
create extension if not exists "pgcrypto";

--------------------------------------------------
-- BARBERSHOPS (TENANTS)
--------------------------------------------------

CREATE TABLE barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- USERS
--------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(30),
    role INTEGER NOT NULL,
    password_hash TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- CUSTOMERS
--------------------------------------------------

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120),
    phone VARCHAR(30),
    email VARCHAR(120),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- SERVICES
--------------------------------------------------

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120) NOT NULL,
    duration_minutes INT NOT NULL,
    price DECIMAL(10,2),
    active BOOLEAN DEFAULT TRUE
);

--------------------------------------------------
-- WORKING HOURS (BARBER SCHEDULE)
--------------------------------------------------

CREATE TABLE working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID REFERENCES users(id),
    day_of_week INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

--------------------------------------------------
-- TIME OFF (VACATIONS / DAYS OFF)
--------------------------------------------------

CREATE TABLE time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID REFERENCES users(id),
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    reason TEXT
);

--------------------------------------------------
-- APPOINTMENTS
--------------------------------------------------

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    barber_id UUID REFERENCES users(id),
    service_id UUID REFERENCES services(id),
    customer_id UUID REFERENCES customers(id),
    appointment_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- BOOKING RULES
--------------------------------------------------

CREATE TABLE booking_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    min_notice_minutes INT DEFAULT 60,
    max_days_in_future INT DEFAULT 30,
    slot_interval_minutes INT DEFAULT 30
);

--------------------------------------------------
-- AVAILABILITY CACHE (OPTIONAL PERFORMANCE)
--------------------------------------------------

CREATE TABLE availability_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID REFERENCES users(id),
    slot_time TIMESTAMP,
    available BOOLEAN,
    generated_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- INDEXES (IMPORTANT FOR PERFORMANCE)
--------------------------------------------------

CREATE INDEX idx_users_barbershop
ON users(barbershop_id);

CREATE INDEX idx_customers_barbershop
ON customers(barbershop_id);

CREATE INDEX idx_services_barbershop
ON services(barbershop_id);

CREATE INDEX idx_appointments_barbershop
ON appointments(barbershop_id);

CREATE INDEX idx_appointments_barber
ON appointments(barber_id);

CREATE INDEX idx_appointments_time
ON appointments(appointment_time);

CREATE INDEX idx_working_hours_barber
ON working_hours(barber_id);

CREATE INDEX idx_timeoff_barber
ON time_off(barber_id);