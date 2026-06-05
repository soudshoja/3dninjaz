-- Allow guest (no-account) coupon redemptions to count against usage_cap.
-- coupon_redemptions.user_id becomes NULLable so a guest redemption row can be
-- written (and usage_count incremented) without a user to attribute. The FK to
-- user(id) stays in place — NULL values are simply not checked by the FK.
-- Idempotent-ish: re-running MODIFY to the same definition is a no-op.
ALTER TABLE coupon_redemptions MODIFY user_id varchar(36) NULL;
