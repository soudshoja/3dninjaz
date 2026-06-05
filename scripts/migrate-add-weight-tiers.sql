-- Per-tier shipping weight for made-to-order products (keychain / clicker).
-- Parallel to products.priceTiers: JSON object of GRAMS keyed by unit count,
-- e.g. {"1":15,"2":18,...}. NULL = no per-tier weight (falls back to the
-- variant -> product.shipping_weight_kg -> default ladder).
-- Idempotent: ADD COLUMN IF NOT EXISTS (MariaDB 10.11).
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_tiers LONGTEXT NULL;
