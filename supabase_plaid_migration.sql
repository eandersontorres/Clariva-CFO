-- ─────────────────────────────────────────────────────────────────────────────
-- Plaid integration — secure token storage
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the Plaid access_token + sync cursor per connected bank item.
--
-- SECURITY: Unlike r7_tenants.settings (which is read via the browser anon key
-- in fetchTenant -> select('*') and therefore leaks anything stored in it), this
-- table has RLS ENABLED with NO permissive policy. That means the anon and
-- authenticated roles get ZERO rows. Only the service_role key (used exclusively
-- in the /api/* serverless functions) bypasses RLS and can read/write the
-- access_token. The browser never sees a bank credential.
--
-- Run this once in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists r7_ledger_plaid_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  item_id           text not null,            -- Plaid item_id
  access_token      text not null,            -- Plaid access_token (server-side only)
  institution_id    text,
  institution_name  text,
  accounts          jsonb not null default '[]'::jsonb,  -- [{account_id, name, mask, type, subtype}]
  cursor            text,                     -- /transactions/sync cursor (null = full backfill)
  status            text not null default 'active',       -- active | error | disconnected
  last_error        text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, item_id)
);

create index if not exists idx_r7_ledger_plaid_items_tenant on r7_ledger_plaid_items (tenant_id);

-- Enable RLS and intentionally create NO policy. Anon/authenticated -> denied.
-- service_role (the /api key) bypasses RLS, so the serverless functions still work.
alter table r7_ledger_plaid_items enable row level security;

-- Belt-and-suspenders: an explicit policy that denies the anon + authenticated
-- roles, in case a future migration accidentally adds a permissive ALL policy.
drop policy if exists "deny anon access to plaid items" on r7_ledger_plaid_items;
create policy "deny anon access to plaid items"
  on r7_ledger_plaid_items
  for all
  to anon, authenticated
  using (false)
  with check (false);
