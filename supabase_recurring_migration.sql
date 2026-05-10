-- ============================================================
-- Clariva CFO — Recurring Transactions Migration
-- Run in Supabase SQL Editor (after the initial supabase_migration.sql).
-- After running, also enable Replication for r7_ledger_recurring under
-- Settings -> Database -> Replication so real-time sync picks it up.
-- ============================================================

-- 1. RECURRING RULES (rent, payroll, subscriptions, insurance, etc.)
CREATE TABLE IF NOT EXISTS r7_ledger_recurring (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  vendor_pattern  TEXT NOT NULL,
  category_id     TEXT REFERENCES r7_ledger_accounts(id) ON DELETE SET NULL,
  account         TEXT DEFAULT '',
  amount          NUMERIC(12,2) NOT NULL,
  variance_pct    NUMERIC(5,2) DEFAULT 10,
  cadence         TEXT NOT NULL CHECK (cadence IN ('monthly','biweekly','weekly','quarterly','annual')),
  day_of_month    INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week     INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_recurring_tenant
  ON r7_ledger_recurring(tenant_id, status);

-- 2. Link real transactions to the recurring rule that matched them
ALTER TABLE r7_ledger_transactions
  ADD COLUMN IF NOT EXISTS recurring_id TEXT
  REFERENCES r7_ledger_recurring(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_txn_recurring
  ON r7_ledger_transactions(recurring_id);

-- 3. RLS
ALTER TABLE r7_ledger_recurring ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_recurring_all" ON r7_ledger_recurring
  FOR ALL USING (true) WITH CHECK (true);

-- Verify:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'r7_ledger_recurring' ORDER BY ordinal_position;
