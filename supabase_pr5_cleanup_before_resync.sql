-- PR5 — Cleanup before re-running Sync Sales with the Orders API split
--
-- Run this ONCE, then click "Sync Sales" in the CFO top bar. The new sync
-- will rewrite sq_sale_<date> rows with the items-only amount and create
-- sq_tax_<date> + sq_tip_<date> entries automatically. Without this cleanup
-- the manual adjustments you inserted last month would still be there,
-- subtracting tax / grat a second time on top of the new categorization.
--
-- Tenant: TorresBee.
-- Safe to re-run — every DELETE filters on specific ids that the new sync
-- won't recreate.

-- 1) Drop the manual adjustments we created while validating May 2026.
--    sq_tax_<date> + sq_tip_<date> from the Orders API replace them.
DELETE FROM r7_ledger_transactions
WHERE tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'
  AND id IN (
    'adj_sales_tax_2026_05',
    'adj_autograt_2026_05'
  );

-- 2) Keep the cash sales adjustment — the Orders API only sees Square-tendered
--    orders, so cash-only walked-out sales (~$2.846/mo) still need to live as
--    a manual line. Same for the delivery commission adjustment — Square
--    Sales Summary's "Other" payment method only tells us the gross, not the
--    aggregator's cut.
--
--    If you ever want to delete them too, run:
--      DELETE FROM r7_ledger_transactions
--      WHERE id IN ('adj_cash_sales_2026_05', 'adj_delivery_commission_2026_05');

-- 3) Verify the cleanup
SELECT id, description, amount
  FROM r7_ledger_transactions
 WHERE tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'
   AND source = 'manual_adjustment'
 ORDER BY id;
-- Expected after cleanup: only adj_cash_sales_2026_05 and
-- adj_delivery_commission_2026_05 remain.
