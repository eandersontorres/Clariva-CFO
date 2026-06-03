-- PR4 — Split transaction + transfer-type categories
--
-- Two structural additions that work together:
--
-- 1) Chart of accounts gains a third category `type` value, 'transfer'.
--    Existing types: income, expense. New: transfer. Categories of this type
--    represent flows of money that pass through the business without being
--    revenue or expense — tip pass-through (the operator collects from the
--    customer and pays the server), Square Holding (PR3 future), Owner Draw,
--    Tax Withholding Payable, etc. The frontend filters them out of every
--    income / expense roll-up via isRevenueRelevant() so they have zero
--    impact on the P&L while still being visible on the cash side.
--
-- 2) r7_ledger_transactions gets `parent_id` so a single bank transaction
--    can be split into multiple sub-rows with different categories. The
--    parent stays as the audit-of-the-bank record; the children carry the
--    real classification. Frontend hides parents from totals when they have
--    children (children are summed instead). ON DELETE CASCADE means
--    deleting the parent removes all children — keeps the ledger consistent
--    if the operator undoes the original transaction.
--
-- After this runs, the seed at the end creates the "Tip Pass-Through"
-- category for TorresBee so the split UI has a sensible default destination.
-- Other tenants will see it on their next category sync (or operator can
-- create it manually with type=transfer).

-- ── 1. Expand r7_ledger_accounts.type to allow 'transfer' ───────────────────
ALTER TABLE r7_ledger_accounts
  DROP CONSTRAINT IF EXISTS r7_ledger_accounts_type_check;

ALTER TABLE r7_ledger_accounts
  ADD CONSTRAINT r7_ledger_accounts_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

-- ── 2. Add parent_id to r7_ledger_transactions ─────────────────────────────
ALTER TABLE r7_ledger_transactions
  ADD COLUMN IF NOT EXISTS parent_id TEXT
  REFERENCES r7_ledger_transactions(id) ON DELETE CASCADE;

-- Children lookup hot path: "find every split child of parent X". Partial
-- index keeps storage small (most rows are not children).
CREATE INDEX IF NOT EXISTS idx_r7_ledger_transactions_parent
  ON r7_ledger_transactions (tenant_id, parent_id)
  WHERE parent_id IS NOT NULL;

-- ── 3. Seed "Tip Pass-Through" for TorresBee ───────────────────────────────
-- Idempotent: skipped if already present (by tenant + name). Color matches
-- the brand purple (--purple in tokens) so it's distinct from income green
-- and expense red.
INSERT INTO r7_ledger_accounts (id, tenant_id, name, type, color, tax_line, is_default)
SELECT
  gen_random_uuid(),
  '5dc58fa8-0a0a-4d24-8906-e32755e36e93'::uuid,
  'Tip Pass-Through',
  'transfer',
  '#9b8ea8',
  NULL,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM r7_ledger_accounts
   WHERE tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'::uuid
     AND name = 'Tip Pass-Through'
);
