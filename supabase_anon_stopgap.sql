-- ============================================================
-- TEMPORARY anon stopgap — Clariva CFO
-- ============================================================
-- Context: a hardening migration replaced every r7_ledger_* / r7_labor_* /
-- r7_payroll_runs RLS policy with tenant-aware checks keyed off auth.uid().
-- The CFO uses the anon key with no login, so anon started seeing 0 rows.
--
-- This restores anon read/write for the TorresBee tenant ONLY, until the
-- Supabase Auth login (Phase A in docs/AUTH_DESIGN.md) ships.
--
-- APPLIED 2026-05-24 via Supabase MCP. Tracked here for reversibility.
-- REVERTED 2026-05-25 — Phase A login is live, per-tenant isolation enforced.
-- This file is now historical; the REVERT block at the bottom was run.
--
-- TO REVERT once login is live (see bottom of file).
-- ============================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'r7_ledger_transactions','r7_ledger_accounts','r7_ledger_budgets',
    'r7_ledger_bills','r7_ledger_projects','r7_ledger_journal',
    'r7_ledger_recurring','r7_ledger_bank_accounts',
    'r7_labor_shifts','r7_labor_tips_daily','r7_payroll_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_torresbee_stopgap ON %I;', t);
    EXECUTE format(
      'CREATE POLICY anon_torresbee_stopgap ON %I FOR ALL TO anon '
      || 'USING (tenant_id = ''5dc58fa8-0a0a-4d24-8906-e32755e36e93''::uuid) '
      || 'WITH CHECK (tenant_id = ''5dc58fa8-0a0a-4d24-8906-e32755e36e93''::uuid);', t
    );
  END LOOP;
END $$;

-- ── REVERT (run after Phase A login is deployed) ──────────────────────────
/*
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'r7_ledger_transactions','r7_ledger_accounts','r7_ledger_budgets',
    'r7_ledger_bills','r7_ledger_projects','r7_ledger_journal',
    'r7_ledger_recurring','r7_ledger_bank_accounts',
    'r7_labor_shifts','r7_labor_tips_daily','r7_payroll_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_torresbee_stopgap ON %I;', t);
  END LOOP;
END $$;
*/
