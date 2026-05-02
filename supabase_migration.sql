-- ============================================================
-- Clariva Ledger — Supabase Migration
-- Run in Supabase SQL Editor (new tab)
-- ============================================================

-- 1. CHART OF ACCOUNTS (categories)
CREATE TABLE IF NOT EXISTS r7_ledger_accounts (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense', 'asset', 'liability')),
  color       TEXT DEFAULT '#555b6b',
  tax_line    TEXT DEFAULT '',
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. TRANSACTIONS (imported from CSV/OFX or manual)
CREATE TABLE IF NOT EXISTS r7_ledger_transactions (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  description  TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  category_id  TEXT REFERENCES r7_ledger_accounts(id) ON DELETE SET NULL,
  account      TEXT DEFAULT 'Checking',
  reconciled   BOOLEAN DEFAULT false,
  source       TEXT DEFAULT 'manual',  -- 'csv', 'ofx', 'manual'
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. BUDGETS
CREATE TABLE IF NOT EXISTS r7_ledger_budgets (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES r7_ledger_accounts(id) ON DELETE CASCADE,
  monthly      NUMERIC(12,2) DEFAULT 0,
  annual       NUMERIC(12,2) DEFAULT 0,
  year         INTEGER DEFAULT EXTRACT(YEAR FROM now()),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, category_id, year)
);

-- 4. JOURNAL ENTRIES (manual adjustments)
CREATE TABLE IF NOT EXISTS r7_ledger_journal (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES r7_tenants(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  memo        TEXT NOT NULL,
  debit_id    TEXT REFERENCES r7_ledger_accounts(id),
  credit_id   TEXT REFERENCES r7_ledger_accounts(id),
  amount      NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── INDEXES ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ledger_txn_tenant  ON r7_ledger_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_txn_date    ON r7_ledger_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_txn_cat     ON r7_ledger_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_ledger_acc_tenant  ON r7_ledger_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_bgt_tenant  ON r7_ledger_budgets(tenant_id);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────────
ALTER TABLE r7_ledger_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE r7_ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE r7_ledger_budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE r7_ledger_journal      ENABLE ROW LEVEL SECURITY;

-- Policies: service role full access (used via anon key + tenant_id check)
CREATE POLICY "ledger_accounts_all"     ON r7_ledger_accounts     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ledger_transactions_all" ON r7_ledger_transactions  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ledger_budgets_all"      ON r7_ledger_budgets       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ledger_journal_all"      ON r7_ledger_journal       FOR ALL USING (true) WITH CHECK (true);

-- ── DEFAULT CATEGORIES for TorresBee (tenant_id = your tenant id) ──
-- Replace 'YOUR_TENANT_ID' with the actual id from r7_tenants
-- Run this separately after getting your tenant_id:
/*
INSERT INTO r7_ledger_accounts (tenant_id, name, type, color, tax_line, is_default) VALUES
  ('YOUR_TENANT_ID', 'Food & Beverage',   'expense', '#f05e5e', 'COGS',        true),
  ('YOUR_TENANT_ID', 'Payroll',           'expense', '#f0c84a', 'Wages',       true),
  ('YOUR_TENANT_ID', 'Rent & Utilities',  'expense', '#4a9ff0', 'Rent',        true),
  ('YOUR_TENANT_ID', 'Marketing',         'expense', '#a47ff0', 'Advertising', true),
  ('YOUR_TENANT_ID', 'Equipment',         'expense', '#f0904a', 'Depreciation',true),
  ('YOUR_TENANT_ID', 'Insurance',         'expense', '#4af0d0', 'Insurance',   true),
  ('YOUR_TENANT_ID', 'Office & Supplies', 'expense', '#90a0b0', 'Office',      true),
  ('YOUR_TENANT_ID', 'Revenue - Dining',  'income',  '#00d4a0', 'Gross Receipts', true),
  ('YOUR_TENANT_ID', 'Revenue - Delivery','income',  '#00b890', 'Gross Receipts', true),
  ('YOUR_TENANT_ID', 'Uncategorized',     'expense', '#555b6b', '',            true);
*/

-- Verify tables created:
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'r7_ledger_%';
