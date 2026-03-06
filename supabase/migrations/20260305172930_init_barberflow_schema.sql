create extension if not exists "pgcrypto";

CREATE TABLE barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(30),
    role INTEGER NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120),
    phone VARCHAR(30),
    email VARCHAR(120),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    name VARCHAR(120),
    duration_minutes INT NOT NULL,
    price DECIMAL(10,2),
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES barbershops(id),
    barber_id UUID REFERENCES users(id),
    service_id UUID REFERENCES services(id),
    customer_id UUID REFERENCES customers(id),
    appointment_time TIMESTAMP,
    status INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);