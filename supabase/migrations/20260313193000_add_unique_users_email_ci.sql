-- Enforce case-insensitive uniqueness for user emails.
-- This prevents duplicate identities under concurrent inserts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
ON users (lower(email))
WHERE email IS NOT NULL;