-- unit_supabase_migration.sql
-- "Favo Bank" — embedded banking via Unit (unit.co) BaaS.
-- Run once in the shared Kitchen Supabase project (SQL editor).
--
-- One row per tenant = that tenant's Favo Bank enrollment. It stores only
-- NON-SECRET references (Unit customer id, the envelope account ids, the card
-- id). The actual bank credential is the Unit ORG TOKEN, which lives ONLY in the
-- Vercel env var UNIT_API_TOKEN and never touches this table or the browser —
-- same security posture as the Plaid access_token in r7_ledger_plaid_items.
--
-- "Envelopes" = multiple Unit deposit accounts under one customer:
--   operating  → the main checking account (Square payouts land here)
--   tax_vault  → sales-tax reserve (CFO Insights decides how much to move)
--   payroll    → payroll reserve
-- Money moves between them with Unit bookPayments (internal, instant, $0).

create table if not exists r7_ledger_unit_accounts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  application_id    text,                 -- Unit businessApplication id
  unit_customer_id  text,                 -- Unit customer id (after approval)
  status            text not null default 'pending',   -- pending | active | error
  accounts          jsonb not null default '[]'::jsonb, -- [{account_id, purpose, name, deposit_product, routing, account_number_masked}]
  card_id           text,                 -- Unit virtual debit card id
  card_last4        text,
  cursor            text,                 -- transaction-sync pagination offset
  last_synced_at    timestamptz,
  last_error        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (tenant_id)
);

create index if not exists idx_unit_accounts_tenant on r7_ledger_unit_accounts (tenant_id);

-- RLS on, NO public policies: the service-role key (server functions) bypasses
-- RLS, so only /api/unit-* can read/write this. The browser reaches Unit data
-- exclusively through those proxies, never directly. Mirrors r7_ledger_plaid_items.
alter table r7_ledger_unit_accounts enable row level security;

-- r7_ledger_transactions already exists. Unit-sourced rows reuse it with
-- source = 'unit' and id = 'unit_<unitTransactionId>', exactly like Plaid's
-- source='plaid' / id='plaid_<id>'. No schema change needed there.
