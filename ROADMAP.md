# Clariva CFO — Roadmap

Live: [cfo.clariva.cloud](https://cfo.clariva.cloud) · Pilot tenant: TorresBee (Round Rock, TX)

This file is the source of truth for what's next. It groups work into **Now / Next / Later / Horizon** so we always know what unblocks SaaS, what unblocks a CFO decision, and what is aspirational.

Effort tags: `XS` < 2h · `S` half-day · `M` 1-2 days · `L` 3-5 days · `XL` 1+ week.

---

## NOW — activate what's already shipped

About 40% of the code merged in the last sessions stays dormant until the steps below run. They're cheap; do them first.

| # | Action | Where | Effort |
|---|---|---|---|
| 1 | Run `supabase_recurring_migration.sql` | Supabase SQL Editor | `XS` |
| 2 | Run `supabase_bank_accounts_migration.sql` | Supabase SQL Editor | `XS` |
| 3 | Enable Replication on `r7_ledger_recurring` and `r7_ledger_bank_accounts` | Supabase → Settings → Database → Replication | `XS` |
| 4 | Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (Production + Preview) | Vercel → Settings → Environment Variables | `XS` |
| 5 | End-to-end validation: create 1 recurring rule (TorresBee rent), 1 checking + 1 credit account, import 1 PDF statement, click Sync Marketing, open Insights to see Bookings Forecast | Live app | `S` |

---

## NEXT — features that unblock real decisions (4 weeks)

Ordered by impact, not by ease.

### 1. Multi-tenant + proper Auth · `L`

**Unblocks:** moving from "TorresBee's app" to a sellable SaaS product.

Today the tenant is read from `VITE_TENANT_ID` env var → one tenant per Vercel deployment. Target: Supabase Auth + `clv_tenant_members` membership table + real tenant-aware RLS (the pattern POS, Marketing, and Book already use).

**Prerequisite:** a dedicated design session — touching RLS policies is fragile. Plan the migration of `USING (true)` permissive policies to tenant-aware ones without losing pilot data.

### 2. Multi-account Phase 2 · `M`

**Unblocks:** working capital management beyond the consolidated view shipped in Phase 1.

- Filter by account in Transactions / Cash Flow / P&L
- Auto-detect internal transfers (matching debit/credit between two of your own accounts → not income/expense)
- Auto-link `account_id` on import (regex `••XXXX` in description matches a registered bank account)
- Per-account balance card on Dashboard
- Per-account reconciliation (today the screen is global)

### 3. Marketing bridge Phase 2 · `S`

**Unblocks:** ROI per campaign — the CMO question.

**Prerequisite:** Clariva Marketing needs to run a daily cron with `date_preset='today'`. When that lands:

- Switch the endpoint grouping from monthly to daily (existing monthly rows keep their stable IDs and stop updating)
- Add per-campaign breakdown using `snapshots.campaigns`
- New variance card: "spend daily vs. planned daily budget"

### 4. Bug hunt round 2 · `S`

Sweep the flows we documented but never validated against real data:

- Posting workflow (auto-match bank vs. Kitchen invoices)
- Reconciliation screen end-to-end
- Bill payment workflow (Kitchen purchase → bill → payment transaction)
- Auto-categorize behavior on a real dataset, not the sample fixtures

### 5. Health · `XS`

- Bundle code-splitting (506KB → ~200KB initial + lazy chunks). Vite already warns on every build.
- Consolidate the three migration files into a single `supabase_migration.sql` for fresh setups.

---

## LATER — 2-3 months out

### Ecosystem expansion

| Item | Triggers when | Why |
|---|---|---|
| **Bridge Purchase → Bills** | `clariva-purchase` module ships (currently "a criar") | Purchase Orders become the source of truth for Bills, replacing the Kitchen-purchase fallback |
| **Bridge POS → CFO** | `pos.clariva.cloud` ships (currently `dev`) | POS becomes the canonical revenue source, complementing or replacing Square snapshots |
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
| `pos` module shipping | Bridge POS → CFO (revenue source alternative) |
| `marketing` adding daily cron | Phase 2 of the Marketing bridge (daily + per-campaign) |
| `admin` module shipping | Centralized multi-tenant management instead of per-app dashboards |
| `clv_apps` registry maturing | Auto-discovery of available modules from inside CFO |

---

## Recommended sequence

Prioritizing as CFO/CEO/CTO of the product:

1. **NOW** (~1 hour total) — activate the dormant code
2. **Multi-tenant + Auth** (~1 week, dedicated session) — the only real blocker for SaaS
3. **Multi-account Phase 2** (~3-5 days) — working capital management for real
4. **Bug hunt round 2** (~2 days) — catch issues before the second tenant does
5. **Bundle splitting + health** (~1 day) — infrastructure for scale
6. Then react to whatever lands first in the rest of the ecosystem (Purchase, POS, Marketing daily sync)

---

_Last updated: 2026-05-11 · Maintained alongside `CLAUDE.md`. Update when scope changes; do not let it drift._
