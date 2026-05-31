-- Guest Checkout Migration
-- Run on the live MariaDB 10.11 database by the operator.
-- All statements are safe to run on existing production data.
--
-- 1. Make orders.user_id nullable (guest checkout stores userId = NULL).
ALTER TABLE orders MODIFY user_id VARCHAR(36) NULL;

-- 2. Add guest_access_token column (NULL for authenticated orders; UUID for guests).
ALTER TABLE orders ADD COLUMN guest_access_token VARCHAR(64) NULL;

-- 3. Add phone column to user table for guest-order linking on registration.
ALTER TABLE `user` ADD COLUMN phone VARCHAR(32) NULL;
