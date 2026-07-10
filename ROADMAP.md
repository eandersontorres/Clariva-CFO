# Favo CFO — Roadmap

Live: [cfo.clariva.cloud](https://cfo.clariva.cloud) · Pilot tenant: TorresBee (Round Rock, TX)

Source of truth for what's next. Grouped **Recently Shipped / Now / Next / Later / Horizon**.

Effort tags: `XS` < 2h · `S` half-day · `M` 1-2 days · `L` 3-5 days · `XL` 1+ week.

---

## RECENTLY SHIPPED

### 2026-05-23/24 · Square labor stack + theme parity

- **Square Labor sync** (`r7_labor_shifts`) — hours, wage, fully-loaded cost (+15% employer tax burden, configurable per tenant). Labor screen with hours / wage / loaded cost / labor% KPIs + payroll variance card (projected vs ledger Wages) + by-employee table.
- **Tips** (`r7_labor_tips_daily`) — card tips per employee from Square **Orders** API (not Payments — fixes attribution to the server, not the card processor). Plus **auto-gratuity** captured from `order.service_charges[]`. Opt-in pool day with equal split (card + auto-grat base).
- **Payroll** (`r7_payroll_runs`) — prep + Paychex CSV export. Pulls hours from Square, computes FLSA overtime per ISO week, tips pre-populated from the Tips screen, bonus/tips editable inline. Submit creates a shadow ledger transaction for bank reconciliation. Does NOT move money — Paychex stays the regulated processor.
- **Sync Sales** (`api/sync-square-sales`) — daily gross sales + processing fees from Square Orders as the canonical revenue source. Re-tags bank-side Square deposits to `source='square_settlement'` so they don't double-count. Centralized `NON_REVENUE_SOURCES` / `isRevenueRelevant()` controls every income rollup.
- **Sidebar hierarchy** — Payroll + Tips nested under Labor.
- **Theme + font parity with Favo Purchase** — Day theme uses Purchase's slate surfaces + indigo `#6366F1`; all typography switched to native system fonts (dropped 4 Google web fonts). Dark mode keeps Favo gold.

### 2026-05-13 · Bookkeeper agent + ecosystem bridges hardening

- **Bookkeeper screen** — 8 rules-based IRS Schedule C checks (1099 >$600, duplicate charges, sales-tax gap, Section 179, Meals 50%, docs >$75, stale uncategorized, personal-mix). Compliance score, next-deadline countdown, period-close checklist, per-issue "Fix all" + "Dismiss", `tags[]` column. 1099 contractor table + CSV export on Tax Summary. Post-import $600-threshold toast.
- **Review-first Transactions** — defaults to Uncategorized tab + Categorized tab, inline Kitchen-invoice match button.
- **Bridges fixed** — Marketing (tenant→slug→restaurant), Bookings Forecast (Book reservations + no-show rate).
- **CSV parser** — multi-cardholder BoA format (CardHolder + last-4), credit-card sign flip, dedup on import.
- **Prior-period flag** — accrual basis for P&L / Tax / Dashboard / Insights; cash basis for Cash Flow / balances.
- **Bug hunt round 2 (partial)** — removed broken `fetchKitchenSnapshots` / `fetchKitchenStaff` (selected non-existent columns); Sync Kitchen is purchases-only now, revenue via Sync Sales.

### Earlier

- Multi-account Phase 1 + 2, Recurring Phase 1 + 2, initial bug hunt + branding, NOW activation (migrations, replication, service role key, UNCATEGORIZED fix).

---

## NOW — ongoing dogfood

TorresBee living in the app surfaces the bugs no sweep finds. Flag anything off in the live app; fix inline before piling on features.

**Pending operator actions:**
- Re-sync Tips/Sales/Labor after each deploy to refresh Square data.
- Compare Payroll run vs Paychex stub at period close (15th) to calibrate the 15% employer-burden rate and spot salaried/off-system gaps.

---

## NEXT — features that unblock real decisions

### 1. Multi-tenant + proper Auth · `L`

**Unblocks:** moving from "TorresBee's app" to a sellable SaaS product.

Today the tenant is `VITE_TENANT_ID` env var → one tenant per deploy. Target: Supabase Auth + `clv_tenant_members` + tenant-aware RLS (the pattern POS/Marketing/Book already use). Also fixes the four hardcoded "TorresBee" strings.

**Prerequisite:** dedicated design session — RLS migration from `USING (true)` permissive policies to tenant-aware ones without losing pilot data is fragile. Worth planning before touching.

### 2. Finish Bug hunt round 2 · `S`

- Posting workflow + Reconciliation screen end-to-end against real data.
- Bill payment workflow (Kitchen purchase → bill → payment transaction).
- Per-account reconciliation (the screen is global today).
- `CLAUDE.md` is stale — it documents a "Ledger / Posting" screen that doesn't exist in the current nav. Reconcile docs with reality.

### 3. Marketing bridge Phase 2 · `S`

**Prerequisite:** Marketing needs a daily `date_preset='today'` cron. Then: daily granularity + per-campaign breakdown + planned-vs-actual variance card.

### 4. Health · `S`

- **Bundle code-splitting** — single chunk now ~540KB, Vite warns every build. Lazy-load screens behind the nav.
- Consolidate migration files into one `supabase_migration.sql` for fresh setups.

---

## LATER — 2-3 months out

### Ecosystem expansion

| Item | Triggers when | Why |
|---|---|---|
| **Bridge Purchase → Bills** | `clariva-purchase` (in `dev`) ships | POs become the source of truth for Bills |
| **Bridge POS → CFO** | `pos.clariva.cloud` ships | Canonical revenue + real avg_ticket for Bookings Forecast |
| **Stack migration: TS + Tailwind** | Before second customer | Aligns with POS/Purchase (now that Day theme + fonts already match) |
| **Brazil-compliant DRE** | Expanding to BR | multi-currency, NFC-e, Pix, Stone/Cielo |

### Product features

| Item | Unblocks |
|---|---|
| **Payroll Level 2 — pay 1099 contractors** | Pay musicians directly via ACH (Modern Treasury / Increase) — lower liability than W-2 |
| **Recurring missing alerts (weekly/biweekly)** | Payroll that didn't land on biweekly cadence |
| **Weekly email reports** | "P&L weekly digest" Monday 8AM to owner |
| **Plaid integration** | When manual imports stop scaling |
| **Receipt photo upload** | Photo → AI extract → link to transaction |
| **What-if scenarios** | "cut marketing 20%, what's runway?" |
| **Persist internal transfer pairings** | Detection runs client-side every render today |
| **Sales tax module** | Texas 8.25% — collected vs filed reconciliation (Bookkeeper flags the gap but can't compute liability yet) |

### Tech health

- Real-time stress test (multiple concurrent sessions)
- Virtualize Transactions table (renders everything; fine at 100, bad at 5k)
- Backup + recovery drill
- Error tracking (Sentry?) + product telemetry

---

## HORIZON — 6+ months out

- **AI Assistant** — natural questions ("why did food cost jump last month?")
- **Anomaly detection** — vendor charges outside pattern, category jumps
- **Investor reports** — investor-ready PDF P&L + cash flow + KPIs
- **Tax automation** — Schedule C export, 1099 generation, TurboTax/CPA pipelines
- **ML forecasting** — demand projection beyond recurring rules
- **Cross-tenant benchmarking** — anonymized network medians

---

## Cross-app dependencies

| Waiting on | Blocks here |
|---|---|
| `purchase` shipping | Bridge Purchase → Bills |
| `pos` shipping | Bridge POS → CFO (revenue + avg_ticket) |
| `marketing` daily cron | Marketing bridge Phase 2 |
| `admin` shipping | Centralized multi-tenant management |
| `clv_apps` registry | Auto-discovery of modules from inside CFO |

---

_Last updated: 2026-05-24 · Maintained alongside `CLAUDE.md` (which is now stale — see Bug hunt round 2). Update when scope changes._
