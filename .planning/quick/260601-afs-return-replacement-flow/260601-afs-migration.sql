-- ============================================================================
-- 260601-afs — Return-for-Replacement Flow Migration
-- Apply via root SSH on 152.53.86.223 (documented path in CLAUDE.md):
--
--   mysql -u <db_user> -p <db_name> < 260601-afs-migration.sql
--
-- Or paste into the cPanel phpMyAdmin SQL tab.
-- After applying, run: SHOW CREATE TABLE order_requests;
-- to verify all columns and the ENUM values match Drizzle schema exactly.
-- ============================================================================

-- Step 1: Verify current table structure before applying
-- SHOW CREATE TABLE order_requests;

-- Step 2: Extend the status ENUM to include shipped, received, expired.
-- MariaDB requires re-specifying the full ENUM list in MODIFY COLUMN.
ALTER TABLE `order_requests`
  MODIFY COLUMN `status` ENUM('pending','approved','rejected','shipped','received','expired')
    NOT NULL DEFAULT 'pending';

-- Step 3: Add return-specific columns.
-- All new columns are nullable so existing cancel-request rows remain valid.
ALTER TABLE `order_requests`
  ADD COLUMN `items`                  LONGTEXT      NULL AFTER `admin_notes`,
  ADD COLUMN `photos`                 LONGTEXT      NULL AFTER `items`,
  ADD COLUMN `return_courier`         VARCHAR(120)  NULL AFTER `photos`,
  ADD COLUMN `return_tracking_number` VARCHAR(160)  NULL AFTER `return_courier`,
  ADD COLUMN `approved_at`            TIMESTAMP     NULL AFTER `return_tracking_number`,
  ADD COLUMN `shipped_at`             TIMESTAMP     NULL AFTER `approved_at`;

-- Step 4: Idempotent upsert of the 5 new email templates.
-- ON DUPLICATE KEY UPDATE touches only the subject + html so custom edits
-- already made by the admin via /admin/email-templates are not overwritten
-- on a re-run (only the variables list is refreshed).
--
-- NOTE: the HTML bodies below are minimal plain-text wrappers — the full
-- brandedEmailTemplate() output is auto-seeded by the Node.js getOrSeed()
-- lazy-seed path the first time renderTemplate() is called for each key.
-- The INSERT here guarantees the row exists in prod before Node starts.

INSERT INTO `email_templates` (`key`, `subject`, `html`, `variables`, `updated_at`)
VALUES
  (
    'return_requested',
    'Return request received for order #{{order_number}}',
    '<p>Hi {{customer_name}},</p><p>We received your return request for order <strong>#{{order_number}}</strong>. Our team will review it and get back to you within 1 business day.</p><p><a href="{{order_link}}">View your order</a></p>',
    '["customer_name","order_number","order_link","store_name","store_url","current_year"]',
    NOW()
  ),
  (
    'return_approved',
    'Your return request has been approved — order #{{order_number}}',
    '<p>Hi {{customer_name}},</p><p>Your return request for order <strong>#{{order_number}}</strong> has been approved.</p><p><strong>Please ship your item back by: {{ship_by_date}}</strong></p><p><strong>Return address:</strong><br>{{return_address}}</p><p>Once you have shipped, please submit your courier and tracking number on your order page.</p><p><a href="{{order_link}}">Submit tracking number</a></p>',
    '["customer_name","order_number","ship_by_date","return_address","order_link","store_name","store_url","current_year"]',
    NOW()
  ),
  (
    'return_rejected',
    'Update on your return request — order #{{order_number}}',
    '<p>Hi {{customer_name}},</p><p>After reviewing your return request for order <strong>#{{order_number}}</strong>, we are unable to approve it at this time.</p><p><strong>Reason:</strong> {{reason}}</p><p>If you have questions, contact us via WhatsApp or email.</p><p><a href="{{order_link}}">View your order</a></p>',
    '["customer_name","order_number","reason","order_link","support_email","store_name","store_url","current_year"]',
    NOW()
  ),
  (
    'return_received',
    'We received your returned item — order #{{order_number}}',
    '<p>Hi {{customer_name}},</p><p>Great news — we have received your returned item for order <strong>#{{order_number}}</strong>. Our team will now begin the re-make process and ship the replacement to you as soon as it is ready.</p><p><a href="{{order_link}}">View your order</a></p>',
    '["customer_name","order_number","order_link","store_name","store_url","current_year"]',
    NOW()
  ),
  (
    'return_expired',
    'Your return window has expired — order #{{order_number}}',
    '<p>Hi {{customer_name}},</p><p>Unfortunately the 3-day shipping window for your approved return on order <strong>#{{order_number}}</strong> has passed without a tracking number being submitted.</p><p>If you still need assistance, please contact us via WhatsApp.</p><p><a href="{{order_link}}">View your order</a></p>',
    '["customer_name","order_number","order_link","support_email","store_name","store_url","current_year"]',
    NOW()
  )
ON DUPLICATE KEY UPDATE
  `variables`   = VALUES(`variables`),
  `updated_at`  = NOW();

-- Step 5: Verify
-- SHOW CREATE TABLE order_requests;
-- SELECT `key`, `subject` FROM `email_templates` WHERE `key` LIKE 'return_%';
