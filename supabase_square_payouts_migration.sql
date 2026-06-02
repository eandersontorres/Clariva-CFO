-- Square Payouts feed — reconciliation source of truth.
--
-- Each row is one Square payout (one ACH/wire that Square sends to the bank).
-- Used to:
--   1. Show side-by-side payout vs bank deposit in the Reconciliation screen
--      so the operator can see whether everything Square liquidated actually
--      landed in the account.
--   2. (PR2) Auto-match each payout to its bank-side transaction by amount +
--      arrival_date and re-write `source='square_settlement'` on the matched
--      row deterministically (no more brittle regex against descriptions).
--
-- Idempotent: payout_id from Square is the PK, so re-syncing the same window
-- just upserts.

CREATE TABLE IF NOT EXISTS r7_square_payouts (
  id               TEXT PRIMARY KEY,            -- Square payout_id
  tenant_id        UUID NOT NULL,
  location_id      TEXT,
  arrival_date     DATE NOT NULL,               -- when Square says funds land
  amount           NUMERIC(12,2) NOT NULL,      -- payout amount in dollars
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT,                        -- SENT / PAID / FAILED
  destination_type TEXT,                        -- BANK_ACCOUNT / CARD
  destination_id   TEXT,                        -- last 4 of dest account
  -- Reserved for PR2 (auto-match). Nullable for now so PR1 ships without it.
  matched_txn_id   TEXT REFERENCES r7_ledger_transactions(id) ON DELETE SET NULL,
  matched_at       TIMESTAMPTZ,
  match_method     TEXT,                        -- 'auto' / 'manual'
  -- Raw payload kept for forensic / audit.
  raw              JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_r7_square_payouts_tenant_date
  ON r7_square_payouts (tenant_id, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_r7_square_payouts_matched
  ON r7_square_payouts (tenant_id, matched_txn_id) WHERE matched_txn_id IS NOT NULL;

-- updated_at trigger (same pattern other r7_* tables use)
CREATE OR REPLACE FUNCTION r7_square_payouts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_r7_square_payouts_updated_at ON r7_square_payouts;
CREATE TRIGGER trg_r7_square_payouts_updated_at
  BEFORE UPDATE ON r7_square_payouts
  FOR EACH ROW EXECUTE FUNCTION r7_square_payouts_touch_updated_at();

-- RLS — same tenant-aware pattern as the rest of r7_*. The logged-in user can
-- read/write their own tenants' payouts; super_admin sees all.
ALTER TABLE r7_square_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS r7_square_payouts_select ON r7_square_payouts;
CREATE POLICY r7_square_payouts_select ON r7_square_payouts
  FOR SELECT TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

DROP POLICY IF EXISTS r7_square_payouts_insert ON r7_square_payouts;
CREATE POLICY r7_square_payouts_insert ON r7_square_payouts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

DROP POLICY IF EXISTS r7_square_payouts_update ON r7_square_payouts;
CREATE POLICY r7_square_payouts_update ON r7_square_payouts
  FOR UPDATE TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin())
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

-- Service-role bypass (used by api/sync-square-payouts and cron). service_role
-- already bypasses RLS by default, so no explicit policy is needed — but if
-- the project later moves to a non-service-role server key, add it here.

-- Enable Supabase Realtime so the Reconciliation screen updates live when the
-- cron writes new payouts.
ALTER PUBLICATION supabase_realtime ADD TABLE r7_square_payouts;
