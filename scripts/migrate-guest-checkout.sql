-- Guest checkout migration: allow orders without a user account (WhatsApp bank transfer)
ALTER TABLE orders MODIFY COLUMN user_id VARCHAR(36) NULL;
