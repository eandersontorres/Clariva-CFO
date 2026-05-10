-- ============================================================
-- Clariva CFO — Bank Accounts Migration
-- Run in Supabase SQL Editor (after the recurring migration).
-- After running, also enable Replication for r7_ledger_bank_accounts under
-- Settings -> Database -> Replication so real-time sync picks it up.
-- ============================================================

-- 1. BANK ACCOUNTS (Checking, Savings, Credit Cards, Cash, Loans, etc.)
CREATE TABLE IF NOT EXISTS r7_ledger_bank_accounts (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id        TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('checking','savings','credit','cash','loan','other')),
  institution      TEXT DEFAULT '',
  opening_balance  NUMERIC(12,2) DEFAULT 0,
  opening_date     DATE DEFAULT CURRENT_DATE,
  credit_limit     NUMERIC(12,2),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_bank_accounts_tenant
  ON r7_ledger_bank_accounts(tenant_id, status);

-- 2. Soft FK from transactions to bank accounts. Coexists with the legacy
--    "account" TEXT column (display name) during the transition; new imports
--    should populate both as bank accounts get registered.
ALTER TABLE r7_ledger_transactions
  ADD COLUMN IF NOT EXISTS account_id TEXT
  REFERENCES r7_ledger_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_txn_account_id
  ON r7_ledger_transactions(account_id);

-- 3. RLS
ALTER TABLE r7_ledger_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_bank_accounts_all" ON r7_ledger_bank_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Verify:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'r7_ledger_bank_accounts' ORDER BY ordinal_position;
