# Handoff — Square → Finance revenue feed is stale (TorresBee)

> **Created:** 2026-05-25 · by the Favo POS validation work.
> **For:** whoever owns the Square → Finance (CFO/ledger) ingestion here.
> **Severity:** revenue not being booked — DRE/cash-flow understated.

---

## ✅ RESOLVED — 2026-05-25 (CFO side)

**Root cause:** the `square_sale_gross` feed (`api/sync-square-sales.js`) is
**manual** — the "Sync Sales" button in the CFO top bar. It is NOT a cron and
its creds/cursor never broke. It had simply not been re-run since 05-18 (every
existing row shares the `2026-05-18 04:35` write timestamp). The Square token in
`r7_tenants.settings.sq_token` is valid.

**What was fixed:**

1. **Backfilled 05-19 → today** by re-running the prod endpoint (idempotent
   upsert on `sq_sale_<date>` / `sq_fee_<date>`). 4,963 payments scanned, all
   six missing days now `in_ledger: true`.
2. **Day-bucketing bug found + fixed** (commit 92e724c): the feed bucketed
   payments by **UTC** date. A restaurant sells at night, so payments after
   ~7pm Central landed on the next UTC day — that's why 05-24 over-reported and
   05-23 under-reported in the first backfill. Now buckets by
   `America/Chicago` (from `r7_tenants.settings.timezone`). Same fix applied to
   the tips feed.
3. **Daily cron added** (`api/cron-sync-square.js`, vercel.json `crons`,
   08:00 UTC = 03:00 Central) firing sales + tips + labor syncs, so the feed
   is self-sustaining and won't go stale again. ← the permanent fix.

**Reconciliation after fix** (`finance_revenue_check`, 05-19→05-24): every day
matches. `ledger_gross` sits between `pos_net` and `pos_gross` as expected —

- ledger uses `amount_money` = **item sales incl tax, excl tip** (correct for
  Gross Receipts: tax is collected revenue, tips are pass-through, not income).
- `ledger − pos_net` ≈ 8.25% (TX sales tax); `pos_gross − ledger` ≈ tips.

So the offset vs `pos_gross` is by design — reconcile against the tax/tip
breakdown, not raw gross. If POS wants exact parity, compare
`pos_net + tax` to `ledger_gross`.

**Note on the POS rule #10:** confirmed — the CFO owns the booking; the POS is
read-only validation. Nothing changed on the POS side.

---

## TL;DR

The pipeline that writes Square sales into the Finance ledger
(`r7_ledger_transactions` with `source = 'square_sale_gross'`, plus
`square_fee` / `square_settlement`) **stopped producing rows after
2026-05-18**. TorresBee kept selling — but for **2026-05-19 → 05-24**
the ledger has **zero** `square_sale_gross` rows, so ~**$28k** of gross
revenue is missing from Finance.

This was caught by a new POS-side reconciliation (`/finance` screen in
`clariva-pos`) that compares POS-validated revenue against the ledger.
The POS is now the **source of truth for "what actually happened"**
(validated against Square with drift zero), so you can use it to verify
the backfill.

---

## Evidence

`r7_ledger_transactions` (source `square_sale_gross`) vs POS-validated
gross (closed `pos_orders`, America/Chicago day buckets), tenant
`5dc58fa8-0a0a-4d24-8906-e32755e36e93`:

| Date (Central) | POS orders | POS gross | Finance booked |
|---|---:|---:|---:|
| 2026-05-24 | 62 | $4,303.00 | — **missing** |
| 2026-05-23 | 97 | $9,777.46 | — **missing** |
| 2026-05-22 | 75 | $5,578.39 | — **missing** |
| 2026-05-21 | 57 | $3,773.42 | — **missing** |
| 2026-05-20 | 41 | $2,320.84 | — **missing** |
| 2026-05-19 | 51 | $2,877.71 | — **missing** |
| 2026-05-18 | — | — | $1,452.86 |
| 2026-05-17 | (POS partial*) | $1,841.25 | $6,545.37 |
| 2026-05-16 | (POS partial*) | $773.71 | $6,049.06 |

\* The POS webhook only went live for TorresBee around mid-May, so POS
data before ~05-18 is sparse. **For 05-19 onward POS is complete and
Finance is empty** — that's the gap to fix. (Don't trust the pre-05-18
day-by-day comparison; trust the post-05-18 side.)

Reproduce in the shared Supabase (`huurnewugpwerkeusolt`):

```sql
select date, count(*), sum(amount) as ledger_gross
  from r7_ledger_transactions
  where tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'
    and source = 'square_sale_gross'
    and date >= current_date - interval '14 days'
  group by date order by date desc;
```

---

## Ledger model (for reference)

- `r7_ledger_transactions`: `id`, `tenant_id`, `date`, `description`,
  `amount` (numeric, dollars), `category_id`, `account`, `account_id`,
  `reconciled`, **`source`** (text — `square_sale_gross`, `square_fee`,
  `square_settlement`, `csv`, `pdf`, `kitchen_purchase`, …), `notes`,
  `tags`.
- `r7_ledger_accounts`: chart of accounts (`type` income/expense,
  `tax_line`, `is_default`). TorresBee revenue accounts: *Revenue -
  Dining*, *Revenue - Delivery*, *Cashback*.
- `r7_ledger_journal`: double-entry (`debit_id`, `credit_id`, `amount`).

Existing Square feed granularity: **1 `square_sale_gross` row per day**
(daily lump, no category/tender breakdown).

---

## What to investigate (in this repo / CFO pipeline)

1. **Where does the `square_sale_gross` feed run?** Find the job/edge
   function/cron that creates these rows (search for `square_sale_gross`,
   `square_settlement`, Square Payments/Settlements API usage).
2. **Why did it stop on 05-18?** Likely candidates:
   - It's **settlement-driven** (Square pays out T+1/T+2) and the
     settlement sync broke or lost its Square token/cursor.
   - A scheduled cron stopped firing.
   - Square credentials/scope expired (the POS side had a missing
     `SQUARE_ACCESS_TOKEN` issue around the same period — check if this
     feed shares those creds).
3. **Confirm the amount semantics** of `square_sale_gross`: is it gross
   incl. tax+tip, net sales, or card-settled only? (POS exposes both
   `pos_gross` = total incl tax+tip and `pos_net` = total − tax − tip,
   so you can match whichever definition the ledger uses.)

---

## Fix + backfill

1. Restore the feed (fix creds/cron/cursor).
2. **Backfill 05-19 → today.** Do NOT double-book days that already
   exist (05-18 and earlier). Idempotency: key on `(tenant_id, date,
   source)` or a Square settlement/payout id.
3. Keep the daily-lump shape, or optionally enrich with tender/category
   (the POS already has per-tender and per-category breakdowns if you
   want to mirror them — see `sales_report()` / `product_mix()` RPCs).

> **Do NOT** have the POS write these ledger rows. Per Favo POS rule
> #10, the POS only reads `r7_*`. The booking stays a CFO/Finance
> responsibility. The POS provides validation only.

---

## Verify the backfill against POS truth

The POS exposes a read-only reconciliation RPC in the same Supabase:

```sql
-- per-day POS-validated gross/net vs ledger square_sale_gross
select finance_revenue_check(
  '5dc58fa8-0a0a-4d24-8906-e32755e36e93'::uuid,
  (current_date - interval '14 days')::date,
  current_date
);
```

After backfill, every day with `pos_gross_cents > 0` should also have a
matching `ledger_gross_cents` (within the gross-vs-net definition
offset). The POS `/finance` screen shows the same check visually —
"Finance gaps" should drop to 0 days.
