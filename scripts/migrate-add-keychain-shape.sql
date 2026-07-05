-- Quick task 260705-azw — add keychainShape column to products.
-- Visual-only shape discriminator for keychain-type products.
-- Idempotent: MariaDB 10.11 supports ADD COLUMN IF NOT EXISTS.
ALTER TABLE products ADD COLUMN IF NOT EXISTS keychainShape ENUM('square','round') NOT NULL DEFAULT 'square';
