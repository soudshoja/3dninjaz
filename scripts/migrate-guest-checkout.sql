-- Guest checkout migration — run once per environment (dev, then prod).
-- Idempotent: uses IF NOT EXISTS so re-running is safe (MariaDB 10.11).
--
-- 1) Orders may be placed without an account (WhatsApp bank transfer + guest PayPal).
ALTER TABLE orders MODIFY COLUMN user_id VARCHAR(36) NULL;

-- 2) Token for the emailed guest order-view link (null for authenticated orders).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_access_token VARCHAR(64) NULL;

-- 3) Phone on the user row — used to auto-link prior guest orders at signup.
ALTER TABLE user ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL;
