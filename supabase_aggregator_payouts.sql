-- Aggregator payouts (DoorDash / UberEats / GrubHub / Wix Restaurants) —
-- mirrors the r7_square_payouts model for the food-delivery platforms.
-- Each row is one payout the platform sent (or said it sent) to the bank,
-- broken into its accounting parts. Source data comes from monthly
-- statement files (PDF/CSV) uploaded via the Reconciliation screen, OR
-- eventually from the inbound email cron that watches a dedicated mailbox.

CREATE TABLE IF NOT EXISTS r7_aggregator_payouts (
  id               TEXT PRIMARY KEY,            -- platform-specific payout id (or hash if absent)
  tenant_id        UUID NOT NULL,
  platform         TEXT NOT NULL,               -- 'doordash' | 'ubereats' | 'grubhub' | 'wix' | 'other'
  period_start     DATE,
  period_end       DATE,
  arrival_date     DATE NOT NULL,               -- when funds were sent / scheduled to bank
  currency         TEXT NOT NULL DEFAULT 'USD',
  -- Money breakdown (all positive, signed semantics applied at render time)
  gross_sales      NUMERIC(12,2) DEFAULT 0,     -- customer-side price collected by platform
  commission       NUMERIC(12,2) DEFAULT 0,     -- platform's marketplace cut
  marketing_fee    NUMERIC(12,2) DEFAULT 0,     -- ad / promotion fees
  delivery_fee     NUMERIC(12,2) DEFAULT 0,     -- platform-charged delivery fee (often passthrough)
  refunds          NUMERIC(12,2) DEFAULT 0,     -- customer refunds / adjustments
  other_fees       NUMERIC(12,2) DEFAULT 0,     -- everything not in the named buckets
  tax_remitted     NUMERIC(12,2) DEFAULT 0,     -- sales tax the platform remitted on the restaurant's behalf
  net_payout       NUMERIC(12,2) NOT NULL,      -- what should actually hit the bank
  -- Reconciliation links (filled by the matcher)
  matched_txn_id   TEXT REFERENCES r7_ledger_transactions(id) ON DELETE SET NULL,
  matched_at       TIMESTAMPTZ,
  match_method     TEXT,                        -- 'auto' / 'manual'
  -- Ingestion provenance
  source           TEXT NOT NULL DEFAULT 'manual_upload', -- 'manual_upload' | 'email_inbox' | 'api'
  email_message_id TEXT UNIQUE,                 -- dedupe key for email-ingested payouts
  filename         TEXT,                        -- original PDF/CSV filename
  raw              JSONB,                       -- everything Claude pulled out, for audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT r7_aggregator_payouts_platform_check
    CHECK (platform IN ('doordash','ubereats','grubhub','wix','other'))
);

CREATE INDEX IF NOT EXISTS idx_r7_aggregator_payouts_tenant_date
  ON r7_aggregator_payouts (tenant_id, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_r7_aggregator_payouts_platform
  ON r7_aggregator_payouts (tenant_id, platform, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_r7_aggregator_payouts_matched
  ON r7_aggregator_payouts (tenant_id, matched_txn_id)
  WHERE matched_txn_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION r7_aggregator_payouts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_r7_aggregator_payouts_updated_at ON r7_aggregator_payouts;
CREATE TRIGGER trg_r7_aggregator_payouts_updated_at
  BEFORE UPDATE ON r7_aggregator_payouts
  FOR EACH ROW EXECUTE FUNCTION r7_aggregator_payouts_touch_updated_at();

-- RLS — same tenant-aware pattern as the rest of r7_*
ALTER TABLE r7_aggregator_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS r7_aggregator_payouts_select ON r7_aggregator_payouts;
CREATE POLICY r7_aggregator_payouts_select ON r7_aggregator_payouts
  FOR SELECT TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

DROP POLICY IF EXISTS r7_aggregator_payouts_insert ON r7_aggregator_payouts;
CREATE POLICY r7_aggregator_payouts_insert ON r7_aggregator_payouts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

DROP POLICY IF EXISTS r7_aggregator_payouts_update ON r7_aggregator_payouts;
CREATE POLICY r7_aggregator_payouts_update ON r7_aggregator_payouts
  FOR UPDATE TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin())
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

-- Realtime so the Reconciliation screen updates live when ingestion writes rows.
-- Wrapped in DO block because ALTER PUBLICATION lacks IF NOT EXISTS.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE r7_aggregator_payouts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
