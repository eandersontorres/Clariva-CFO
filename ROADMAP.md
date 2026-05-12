# Clariva CFO — Roadmap

Live: [cfo.clariva.cloud](https://cfo.clariva.cloud) · Pilot tenant: TorresBee (Round Rock, TX)

This file is the source of truth for what's next. It groups work into **Recently Shipped / Now / Next / Later / Horizon** so we always know what unblocks SaaS, what unblocks a CFO decision, and what is aspirational.

Effort tags: `XS` < 2h · `S` half-day · `M` 1-2 days · `L` 3-5 days · `XL` 1+ week.

---

## RECENTLY SHIPPED

What landed in the last few sessions, kept here as institutional memory until it ages off.

### 2026-05-12 · Multi-account Phase 2

Working capital management for real, in four small commits:
- **2.1** auto-link `account_id` on every import (PDF/CSV/OFX/Kitchen/Marketing) via name match with last-4-digit fallback
- **2.2** account filter dropdown on the Transactions screen (only renders when ≥1 account is registered)
- **2.3** Cash Position card on the Dashboard — Liquid / Debt / Net + per-account mini cards with credit utilization
- **2.4** internal transfer detection — pairs debit/credit between your own accounts (opposite signs, matching amount, ±2 days, different `account_id`) and excludes them from income/expense totals; "↔ Internal" badge in the Transactions table

### 2026-05-11/12 · NOW activated + unplanned fixes

Activation surfaced several latent bugs that got fixed in the same session:

- Both migrations applied (`r7_ledger_recurring`, `r7_ledger_bank_accounts`).
- Replication enabled on **all 7** `r7_ledger_*` tables (only `crm_*` and one POS table were on before — the "Live" indicator on the top bar had been lying since launch).
- `SUPABASE_SERVICE_ROLE_KEY` added in Vercel, the Marketing + Bookings Forecast endpoints now respond 200.
- **UNCATEGORIZED bug** — the client sentinel `"10"` was being saved into a UUID FK column, silently dropping every import without a category. Translation layer added in both directions.
- **Marketing bridge tenant mapping** — `r7_tenants.id` and `mkt_restaurants.id` are independent UUIDs; resolution now goes through `slug`.
- **Forecast bridge avg_ticket** — `r7_snapshots` is inventory, not Square POS revenue. The query was failing on a non-existent column. Removed for now; will be wired back in when `pos_orders` ships.
- **Hardcoded dates** — "January 2025" and "Fiscal Year 2025" page subtitles, plus the tax export filename, all derived from `dateRange` now.
- **Missing `.gap-10` utility** — the Budget category swatch was glued to its label.

### Earlier · ecosystem bridges + Recurring + Bank Accounts foundations

- Recurring transactions Phase 1 + 2 (rules CRUD, auto-match on import, monthly forecast on Cash Flow, drift/missing alerts on Insights).
- Multi-account Phase 1 (CRUD, per-account balance with credit utilization).
- Bridge Clariva Marketing → CFO (monthly ad-spend accruals; daily granularity is Phase 2, waiting on Marketing's daily cron).
- Bridge Clariva Book → CFO Insights (forward-looking demand card with no-show rate).

---

## NOW — ongoing dogfood

The original NOW table from the previous version is fully checked off. What's left is **operational use** — TorresBee actually living in the app — which is what surfaces the bugs no automated sweep finds (see the "unplanned fixes" above).

Recommended cadence: every time you spot something off in the live app, flag it; we'll fix it inline before adding more features.

---

## NEXT — features that unblock real decisions

Ordered by impact, not by ease.

### 1. Multi-tenant + proper Auth · `L`

**Unblocks:** moving from "TorresBee's app" to a sellable SaaS product.

Today the tenant is read from `VITE_TENANT_ID` env var → one tenant per Vercel deployment. Target: Supabase Auth + `clv_tenant_members` membership table + real tenant-aware RLS (the pattern POS, Marketing, and Book already use).

**Prerequisite:** a dedicated design session — touching RLS policies is fragile. Plan the migration of `USING (true)` permissive policies to tenant-aware ones without losing pilot data. Also unlocks fixing the four hardcoded "TorresBee" strings flagged during the dates sweep.

### 2. Marketing bridge Phase 2 · `S`

**Unblocks:** ROI per campaign — the CMO question.

**Prerequisite:** Clariva Marketing needs to run a daily cron with `date_preset='today'`. When that lands:

- Switch the endpoint grouping from monthly to daily (existing monthly rows keep their stable IDs and stop updating)
- Add per-campaign breakdown using `snapshots.campaigns`
- New variance card: "spend daily vs. planned daily budget"

### 3. Bug hunt round 2 · `S`

Sweep the flows we documented but never validated against real data:

- Posting workflow (auto-match bank vs. Kitchen invoices)
- Reconciliation screen end-to-end
- Bill payment workflow (Kitchen purchase → bill → payment transaction)
- `fetchKitchenSnapshots` selects columns that don't exist on `r7_snapshots` (`gross_sales`, `net_sales`, `avg_ticket`, `orders`, `tips`) — Sync Kitchen revenue silently returned `[]` in production from day one. Decide: drop the call, or rewrite against `pos_orders` once POS ships.
- Per-account reconciliation (the screen is global today)

### 4. Health · `XS`

- Bundle code-splitting (~507KB → ~200KB initial + lazy chunks). Vite warns on every build.
- Consolidate the three migration files into a single `supabase_migration.sql` for fresh setups.

---

## LATER — 2-3 months out

### Ecosystem expansion

| Item | Triggers when | Why |
|---|---|---|
| **Bridge Purchase → Bills** | `clariva-purchase` module ships (already in `dev`) | Purchase Orders become the source of truth for Bills, replacing the Kitchen-purchase fallback |
| **Bridge POS → CFO** | `pos.clariva.cloud` ships (currently `dev`) | POS becomes the canonical revenue source, complementing or replacing Square snapshots — also unblocks real avg_ticket for the Bookings Forecast card |
| **Stack migration: TS + Tailwind + Zustand** | Before the second customer | Aligns with POS / Purchase. Reduces cognitive load across modules. Pure refactor, zero new feature — only do once a real second tenant exists |
| **Brazil-compliant DRE** | When expanding to BR | POS is already dual-region. CFO will need: multi-currency, NFC-e, Pix, Stone/Cielo, region adapter |

### Product features

| Item | Unblocks |
|---|---|
| **Recurring missing alerts (weekly/biweekly)** | Today only monthly cadence triggers a missing alert. Extend to payroll that didn't land on biweekly |
| **Weekly email reports** | "P&L weekly digest" delivered Monday 8AM to the owner — top-of-mind decisions |
| **Plaid integration** | When manual PDF/CSV imports stop scaling — direct bank account sync |
| **Receipt photo upload** | Owner snaps a photo → AI extracts → links to a transaction. Mirrors the Kitchen invoice scanner |
| **What-if scenarios** | Cash-flow modeling: "if I cut marketing 20%, what does runway look like?" — CFO/CEO decision tool |
| **Persist internal transfer pairings** | Today detection runs client-side every render. Persisting via `source='internal_transfer'` lets P&L / Cash Flow exclude them consistently and survives offline state |

### Tech health

- Real-time stress test (multiple concurrent sessions)
- Virtualize the Transactions table (today renders everything — fine at 100 rows, bad at 5k)
- Backup and recovery drill
- Error tracking (Sentry?) and product telemetry

---

## HORIZON — 6+ months out

When CFO has matured into a real SaaS product, opportunities open up:

- **AI Assistant** — Claude integrated for natural questions: "why did my food cost jump last month?", "how much did I spend with Sysco this quarter?"
- **Anomaly detection** — automatic alerts when a vendor charges outside its pattern, when a category jumps relative to history
- **Investor reports** — exportable monthly P&L + cash flow + KPIs in investor-ready PDF
- **Tax automation** — Schedule C export, 1099 generation, integration with TurboTax / CPA pipelines
- **ML forecasting** — use history to project demand beyond what recurring rules can model
- **Cross-tenant benchmarking** — anonymized aggregates across all Clariva restaurants → "your food cost is above the network median for casual dining in Texas"

---

## Cross-app dependencies

| Waiting on | Blocks here |
|---|---|
| `purchase` module shipping | Bridge Purchase → Bills (refactor of Bills source) |
| `pos` module shipping | Bridge POS → CFO (revenue source alternative + real avg_ticket for Bookings Forecast) |
| `marketing` adding daily cron | Phase 2 of the Marketing bridge (daily + per-campaign) |
| `admin` module shipping | Centralized multi-tenant management instead of per-app dashboards |
| `clv_apps` registry maturing | Auto-discovery of available modules from inside CFO |

---

## Recommended sequence

Prioritizing as CFO/CEO/CTO of the product:

1. **Multi-tenant + Auth** (~1 week, dedicated session) — the only real blocker for SaaS
2. **Bug hunt round 2** (~2 days) — catch latent issues like `fetchKitchenSnapshots` before more tenants do
3. **Bundle splitting + health** (~1 day) — infrastructure for scale
4. Then react to whatever lands first in the rest of the ecosystem (Purchase, POS, Marketing daily sync)

---

_Last updated: 2026-05-12 · Maintained alongside `CLAUDE.md`. Update when scope changes; do not let it drift._
