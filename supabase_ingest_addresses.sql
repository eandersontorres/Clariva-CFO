-- Per-tenant inbound email addresses + the log of what arrived on them.
--
-- Turns the aggregator payout ingest from a one-tenant hack into a module
-- fixture: every tenant gets <token>@payouts.clariva.cloud, and onboarding is
-- "paste this address into the DoorDash portal as a notification recipient".
-- No per-tenant infrastructure, no forwarding rules.
--
-- `kind` is here from day one because Kitchen wants the same thing for vendor
-- invoices. Build the addressing once.
--
-- Apply order: this file is safe to run before OR after the code that reads it
-- (api/ingest-aggregator-email.js falls back to AGGREGATOR_INGEST_TENANT_ID
-- when the lookup fails, which is exactly how it behaved before these tables).

CREATE TABLE IF NOT EXISTS r7_ingest_addresses (
  token         TEXT PRIMARY KEY,            -- the local-part; THIS IS A CREDENTIAL
  tenant_id     UUID NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'aggregator_payout',
  label         TEXT,                        -- operator-facing note, e.g. 'TorresBee — delivery'
  active        BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  CONSTRAINT r7_ingest_addresses_kind_check
    CHECK (kind IN ('aggregator_payout', 'bank_statement', 'vendor_invoice'))
);

CREATE INDEX IF NOT EXISTS idx_r7_ingest_addresses_tenant
  ON r7_ingest_addresses (tenant_id, kind) WHERE active;

-- Every inbound email lands here whatever happens to it. A financial module
-- that silently eats a statement burns trust faster than one that rejects it
-- loudly, so rejections are logged with their reason too.
CREATE TABLE IF NOT EXISTS r7_ingest_events (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        UUID,                     -- null when the address didn't resolve
  token            TEXT,
  kind             TEXT NOT NULL DEFAULT 'aggregator_payout',
  message_id       TEXT,
  from_addr        TEXT,
  to_addr          TEXT,
  subject          TEXT,
  filename         TEXT,
  platform         TEXT,
  outcome          TEXT NOT NULL,            -- see CHECK below
  detail           TEXT,                     -- error message / rejection reason
  payouts_ingested INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT r7_ingest_events_outcome_check
    CHECK (outcome IN (
      'accepted',
      'duplicate',
      'rejected_unknown_address',
      'rejected_sender',
      'rejected_unauthenticated',
      'no_attachment',
      'parse_failed',
      'write_failed'
    ))
);

CREATE INDEX IF NOT EXISTS idx_r7_ingest_events_tenant_date
  ON r7_ingest_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_r7_ingest_events_message
  ON r7_ingest_events (message_id) WHERE message_id IS NOT NULL;

-- Mints an address for a tenant and returns the token. Run this instead of
-- committing a token to the repo — the token is a credential, the whole point
-- of it is that it isn't written down anywhere public.
--
--   SELECT r7_mint_ingest_address('5dc58fa8-0a0a-4d24-8906-e32755e36e93');
--   -> 'a3f91c27be40d5f8a1b6'  =>  a3f91c27be40d5f8a1b6@payouts.clariva.cloud
--
-- 20 hex chars = 80 bits, from gen_random_uuid()'s CSPRNG. Deliberately NOT
-- random() — that's a seeded PRNG, and this token is a credential: it ends up
-- stored in the DoorDash portal and travels in mail headers, so it has to
-- survive being semi-public.
CREATE OR REPLACE FUNCTION r7_mint_ingest_address(
  p_tenant_id UUID,
  p_kind      TEXT DEFAULT 'aggregator_payout',
  p_label     TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
BEGIN
  new_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

  INSERT INTO r7_ingest_addresses (token, tenant_id, kind, label)
  VALUES (new_token, p_tenant_id, p_kind, p_label);

  RETURN new_token;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Bumps the "last email received" counters after a successful ingest. An RPC
-- rather than an UPDATE so the increment can't race two simultaneous emails
-- into the same value.
CREATE OR REPLACE FUNCTION r7_touch_ingest_address(p_token TEXT)
RETURNS VOID AS $$
  UPDATE r7_ingest_addresses
     SET last_seen_at  = now(),
         message_count = message_count + 1
   WHERE token = p_token;
$$ LANGUAGE sql VOLATILE;

-- RLS — same tenant-aware pattern as the rest of r7_*.
-- The serverless ingest uses the service role and bypasses all of this; these
-- policies exist so the browser can render the address and the event log.
ALTER TABLE r7_ingest_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE r7_ingest_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS r7_ingest_addresses_select ON r7_ingest_addresses;
CREATE POLICY r7_ingest_addresses_select ON r7_ingest_addresses
  FOR SELECT TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

-- Rotation (Phase 2) revokes by flipping `active`; minting stays server-side.
DROP POLICY IF EXISTS r7_ingest_addresses_update ON r7_ingest_addresses;
CREATE POLICY r7_ingest_addresses_update ON r7_ingest_addresses
  FOR UPDATE TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin())
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

DROP POLICY IF EXISTS r7_ingest_events_select ON r7_ingest_events;
CREATE POLICY r7_ingest_events_select ON r7_ingest_events
  FOR SELECT TO authenticated
  USING (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());

-- Realtime so the Phase 2 settings card updates the moment an email lands.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE r7_ingest_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
