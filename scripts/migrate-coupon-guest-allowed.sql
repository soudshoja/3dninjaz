-- Per-coupon guest access — run once per environment (dev, then prod).
-- guest_allowed = TRUE (default): coupon works for guests + registered users.
-- guest_allowed = FALSE: coupon restricted to logged-in customers.
-- Existing coupons default to TRUE (open to all), matching prior behaviour intent.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS guest_allowed BOOLEAN NOT NULL DEFAULT TRUE;
