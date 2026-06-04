-- Order-level discount fields — run once per environment (dev, then prod).
-- Idempotent (MariaDB 10.11 supports ADD COLUMN IF NOT EXISTS).
--
-- discount_amount: MYR subtracted from subtotal (checkout coupon OR admin discount).
-- discount_code:   coupon code, or "MANUAL" for an admin-entered amount. NULL = none.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(64) NULL;
