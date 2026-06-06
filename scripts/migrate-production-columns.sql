-- Production board (admin fulfilment) — adds per-line production tracking to
-- order_items. Matches Drizzle schema:
--   productionDone: boolean("production_done").notNull().default(false)
--   productionSort: int("production_sort")  -- nullable
--
-- Idempotent (MariaDB 10.11 supports ADD COLUMN IF NOT EXISTS).
-- Applied to dev (ninjaz_3dn) and prod (ninjaz_3dnp) on 2026-06-06.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS production_done TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_sort INT NULL;
