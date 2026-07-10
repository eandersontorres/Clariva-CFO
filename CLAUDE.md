# Favo CFO

Bookkeeping & financial intelligence platform for restaurant operators. Part of the Favo ecosystem (companion to **Favo Kitchen / Restauran7**).

**Live:** [cfo.clariva.cloud](https://cfo.clariva.cloud)
**Repo:** [github.com/eandersontorres/Favo-CFO](https://github.com/eandersontorres/Favo-CFO)
**Pilot tenant:** TorresBee Restaurant — Round Rock, TX (`tenant_id: 5dc58fa8-0a0a-4d24-8906-e32755e36e93`)

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | React 18 + Vite 5 (single-file SPA pattern) |
| Backend | Vercel Serverless Functions (`/api/*`) |
| Database | Supabase US (`huurnewugpwerkeusolt.supabase.co`) — same project as Kitchen |
| AI | Anthropic API via `/api/anthropic.js` proxy |
| Deploy | Vercel Pro · auto-deploys from `main` |
| Domain | `cfo.clariva.cloud` (GoDaddy → Vercel CNAME) |

---

## Project Structure

```
Favo-CFO/
├── api/
│   └── anthropic.js          # Proxy to Anthropic API (PDF parsing, AI categorization)
├── src/
│   ├── App.jsx               # ~3,300 lines, single-file SPA (all screens)
│   ├── main.jsx              # Vite entry
│   └── lib/
│       └── supabase.js       # All DB queries + Kitchen bridge functions
├── supabase_migration.sql    # Initial schema (run on first setup)
├── vercel.json               # Vercel config
├── package.json
└── index.html
```

> **Important:** Follows the **single-file App.jsx pattern** from Restauran7. All screens, components, helpers, and styles in `src/App.jsx`. Avoid breaking into multiple files unless you're refactoring intentionally.

---

## Environment Variables (Vercel)

```
VITE_SUPABASE_URL=https://huurnewugpwerkeusolt.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase → Settings → API>
VITE_TENANT_ID=5dc58fa8-0a0a-4d24-8906-e32755e36e93
ANTHROPIC_API_KEY=<sk-ant-... server-side, no VITE_ prefix>
```

---

## Database Schema (Supabase)

All tables live in the **shared Kitchen Supabase project** with `r7_ledger_*` prefix.

### Tables

| Table | Purpose |
|-------|---------|
| `r7_ledger_transactions` | All financial transactions (imports, manual entries) |
| `r7_ledger_accounts` | Chart of Accounts (categories) |
| `r7_ledger_budgets` | Monthly/annual budgets per category |
| `r7_ledger_bills` | Accounts Payable (bills to pay) |
| `r7_ledger_projects` | Future projects & projections |
| `r7_ledger_journal` | Manual journal entries (reserved for future) |

### Kitchen Bridge (read-only access)

These tables are **read** from the Kitchen side via the **Sync Kitchen** button:

| Kitchen Table | Used For |
|--------------|----------|
| `r7_purchases` | Vendor invoices → expense transactions |
| `r7_snapshots` | Daily Square POS revenue → income transactions |
| `r7_vendors` | Vendor name lookup map |
| `r7_staff` | (reserved) Payroll reference |
| `r7_items` | (reserved) Food cost cross-reference |
| `r7_tenants` | Tenant info |

### Key Schema Details

- **`tenant_id` is `UUID`** in all tables (NOT `TEXT`) — must match `r7_tenants.id`
- All ledger tables have RLS enabled with permissive policies (`USING (true) WITH CHECK (true)`)
- `r7_ledger_transactions.posted` and `posted_at` track posting workflow
- `r7_ledger_transactions.category_id` references `r7_ledger_accounts(id)` ON DELETE SET NULL
- `r7_ledger_transactions.id` is `TEXT` (not UUID) — uses prefixed IDs like `pdf_xxx`, `csv_xxx`, `kitchen_purchase_xxx`

---

## Application Architecture

### Main App.jsx Sections (in order)

1. **Imports** — supabase client, all CRUD/bridge functions
2. **STYLES** — full CSS with Favo palette and font tokens
3. **SAMPLE_DATA** — demo data when `VITE_TENANT_ID === "demo"`
4. **HELPERS** — `fmt`, `fmtDate`, date utilities
5. **AUTO-CATEGORIZATION** — `getCategoryHistory()`, `suggestCategory()`, `normalizeDescription()`
6. **BUDGET ALERTS** — `getBudgetAlerts()` returns categorized alerts
7. **PARSERS** — inline `parseBoACSV()` and `parseOFX()` (DO NOT extract to separate file — caused build issues in past)
8. **DATE HELPERS** — `firstOfMonth()`, `quarterStart()`, `DATE_PRESETS`
9. **DateRangePicker** component
10. **KitchenSyncButton** component
11. **Icon** component (inline SVG library)
12. **Toast** component
13. **Screen Components** (in order in NAV):
    - `Dashboard`
    - `Insights` (CFO Insights — health scorecard, alerts, action checklists)
    - `SalesReport` (Bank vs POS comparison)
    - `Ledger` (Posting workflow with auto-match)
    - `Projects` (future investments timeline/board/list)
    - `Transactions` (with import drop zone)
    - `Categories` (Chart of Accounts CRUD)
    - `PLReport`
    - `CashFlow`
    - `Budget` (with alerts banner)
    - `Bills` (Accounts Payable)
    - `Reconciliation`
    - `TaxSummary`
14. **MAIN APP** — `export default function App()` with all state, sync logic, and render switch

### Data Synchronization

The app uses **4 layers of sync**:

1. **Initial load** on mount and date range change
2. **30-second polling** (silent background refresh)
3. **Tab visibility listener** (refresh when user returns to tab)
4. **Supabase real-time subscriptions** on all 5 ledger tables (instant cross-device updates)

Top bar shows live indicator: 🟢 Live = real-time connected, ⚫ = polling-only fallback.

### Save-on-Change Pattern

Every state mutation persists to Supabase immediately:

```javascript
// Pattern used everywhere:
setTransactions(prev => {
  const updated = prev.map(t => t.id === id ? { ...t, category: catId } : t);
  if (saveTransactions) {
    const changed = updated.filter(t => t.id === id);
    saveTransactions(changed); // async write to Supabase
  }
  return updated;
});
```

The main App declares helpers (`saveTransactions`, `saveCategory`, `saveBudget`, `saveBill`, `saveProject`) that wrap the supabase.js upsert functions and skip writes when `TENANT_ID === "demo"`.

### Auto-Categorization

When importing transactions (CSV/OFX/PDF), the system:
1. Builds a history map from existing transactions: `normalizedDescription → mostUsedCategoryId`
2. For each new transaction, looks up the normalized description and pre-fills the category
3. Marks auto-categorized transactions with `autoCategorized: true`
4. Renders a ✨ badge and gold border in the dropdown
5. Manual category change clears the flag

Normalization strips digits and special chars, keeps first 3 significant uppercase words.

### Real Data Flow

```
[User] imports BoA PDF
   ↓
[Browser] reads PDF, base64 encodes
   ↓
[POST /api/anthropic] forwards to Anthropic API with key
   ↓
[Claude] extracts transactions as JSON array
   ↓
[Browser] auto-categorizes via history, expands date range to match dates
   ↓
[setTransactions + saveTransactions] writes to Supabase
   ↓
[Real-time subscriptions] notify all other connected sessions
```

---

## Critical Patterns to Preserve

### 1. Inline parsers (DO NOT extract)
The `parseBoACSV` and `parseOFX` functions MUST stay inline in `App.jsx`. Past attempts to use a separate `src/lib/parsers.js` file broke builds because the regex with `\r\n` got mangled during git commits via the GitHub web editor. Keep them inline using `.split('\n').map(l => l.replace('\r', ''))` instead of regex.

### 2. Anthropic via proxy
Never call Anthropic API directly from the browser. Always go through `/api/anthropic.js`. The `ANTHROPIC_API_KEY` is server-side only (no `VITE_` prefix) to keep it secret.

### 3. Tenant ID handling
All Supabase calls accept an optional `tenantId` parameter, defaulting to `import.meta.env.VITE_TENANT_ID || 'demo'`. When `'demo'`, save functions early-return without writing.

### 4. Field name mapping
JS uses camelCase, Supabase uses snake_case. Conversion happens in `supabase.js`:
- `dueDate` ↔ `due_date`
- `categoryId` ↔ `category_id`
- `taxLine` ↔ `tax_line`
- `projectedRevenue` ↔ `projected_revenue`
- `paidDate` ↔ `paid_date`
- `paidMethod` ↔ `paid_method`
- `txnId` ↔ `txn_id`
- `postedAt` ↔ `posted_at`

### 5. Transaction ID format
Use prefixed IDs to identify source:
- `csv_<timestamp>_<i>` — CSV imports
- `ofx_<fitid or random>` — OFX imports
- `pdf_<timestamp>_<i>` — PDF (Anthropic) imports
- `kitchen_purchase_<r7_purchase_id>` — Synced from Kitchen
- `kitchen_snapshot_<r7_snapshot_id>` — Synced from Kitchen
- `payment_<bill_id>_<timestamp>` — Bill payments
- `bill_manual_<timestamp>` — Manually added bills
- `p_<timestamp>` — Manually added projects

### 6. Date range auto-expand on import
When user imports a statement with dates outside the current date range, automatically expand the range to match. Without this, imported transactions would appear to "disappear" because they're filtered out by the active date range.

### 7. Merge instead of replace on loadAll
The `loadAll` function MUST merge DB data with local state, not replace. Otherwise transactions that were imported but not yet saved (race condition) would be lost on the next polling tick.

```javascript
setTransactions(prev => {
  if (txns.length === 0) return prev;
  const dbIds = new Set(txns.map(t => t.id));
  const localOnly = prev.filter(t => !dbIds.has(t.id));
  return [...txns, ...localOnly];
});
```

---

## Brand & Design System

**Favo rebrand "Caminho B (v2)"** — minimalist system shared across all Favo modules. Full spec + assets: `C:\Dev\Clariva\rebrand\clariva-assets-B\BRAND.md`.

Golden rule: **deep tone on light background, signal tone on dark background.** Accent color appears only in: the mark's dot, the primary action (1 button per screen), key data, links/interaction, focus/selection, live status/badges. Everything else is black/white/gray.

### Colors (CFO module)

```css
/* dark theme (default) */
--bg: #101416              /* dark base */
--text: #E8ECED
--accent: #46BC88          /* cfo-signal (green) */
--red: #EE7E6B             /* marketing-signal */
--yellow: #E8A93C          /* kitchen-signal */
--blue: #4E9FB4            /* petrol-signal */
--purple: #A594E8          /* book-signal */

/* light theme (:root.theme-light) */
--bg: #F6F6F4              /* paper */
--text: #0A0A0A            /* ink */
--accent: #2E7D5B          /* cfo-deep */
```

### Typography

- **Inter** — wordmark, titles, interface, data. Weights 400/500/600/700.
- **DM Mono** — technical labels, small numbers, badges.

### Logo

- Mark: two symmetric "C"s + center dot (`FavoMark` component in App.jsx). Dot = module color (CFO green). Never rotate/tilt/squeeze; no shadow, gradient, or outline.
- Wordmark: `Favo.` in Inter Bold 700, `letter-spacing: -0.03em`, dot in accent color.
- "CFO" subtitle in DM Mono accent.
- Favicon/app-icon: `public/clariva-cfo-dark.svg` (module dark icon from the asset pack).

---

## Workflows

### Importing a bank statement (3 formats supported)

1. User clicks **Import Statement** or drags file into drop zone
2. System detects format by extension:
   - `.pdf` → POSTs base64 to `/api/anthropic` for AI extraction
   - `.ofx` / `.qfx` → inline `parseOFX()`
   - `.csv` → inline `parseBoACSV()`
3. Auto-categorization applied based on history
4. Date range auto-expanded to include imported dates
5. Saved to Supabase
6. Real-time triggers refresh on other connected devices

### Sync Kitchen workflow

User clicks "Sync Kitchen" in top bar:
1. `fetchKitchenPurchases()` — vendor invoices in date range
2. `fetchKitchenSnapshots()` — daily Square POS revenue in date range
3. `fetchKitchenVendors()` — for vendor name lookup
4. Transforms to ledger transactions via `purchasesToTransactions()` and `snapshotsToTransactions()`
5. De-duplicates against existing IDs
6. Saves new ones to Supabase

### Posting workflow (Ledger screen)

1. **Auto-Match** — Cross-references bank transactions with Kitchen invoices using fuzzy matching:
   - Amount within $1
   - Date within ±5 days
   - Description partial match
   - Score = amount_match (50) + date_match (30) + desc_match (20)
   - Min score to appear: 50
2. **Post selected** — User selects N transactions, opens modal, picks category/account/notes, confirms
3. Transactions move from "Unposted" tab to "Posted" tab with `posted_at` timestamp
4. **Unpost** available for corrections

### Bill payment workflow (Bills screen)

1. Bills auto-populate from Kitchen purchases (via Sync Kitchen)
2. User clicks "Pay Bill" on any bill
3. Modal collects: payment date, method (Bank Transfer / Check / ACH / Credit Card / Zelle / Wire), notes
4. On confirm:
   - Bill marked as `paid` with `paid_date` and `paid_method`
   - New ledger transaction created for the payment
   - Original `kitchen_purchase` transaction is replaced

---

## Common Tasks

### Adding a new screen

1. Add screen component (function) in `App.jsx` before `// ─── MAIN APP`
2. Add icon to the `Icon` component map
3. Add NAV entry: `{ id: "newscreen", label: "Label", icon: "iconname" }`
4. Add render case in switch: `case "newscreen": return <NewScreen ... />`
5. Pass needed props (transactions, categories, dateRange, save functions, showToast)

### Adding a new database table

1. Write SQL migration file (use UUID for tenant_id, follow `r7_ledger_*` naming)
2. Add fetch + upsert + delete functions in `src/lib/supabase.js`
3. Add state + load logic in main App
4. Add to real-time channel subscriptions in the useEffect
5. Add save function in main App
6. Pass through to relevant screen via renderScreen

### Adding a new field to existing table

1. SQL: `ALTER TABLE r7_ledger_X ADD COLUMN IF NOT EXISTS field_name TYPE`
2. Update `upsert*` mapping in `src/lib/supabase.js`
3. Update `fetch*` if explicit columns selected
4. Update load logic in main App if name conversion needed (camelCase ↔ snake_case)

---

## Known Issues / Watch-outs

- **GitHub web editor mangles regex with `\r\n`** — never put line-splitting regex in code that will be pasted via GitHub's editor. Use `.split('\n')` instead.
- **Vite SPA routing** — `vercel.json` has rewrite for `/(.*)` → `/index.html`. Don't break this.
- **Sample data fallback** — when `VITE_TENANT_ID === "demo"`, app uses `SAMPLE_TRANSACTIONS`. Useful for testing without DB but make sure it doesn't leak to production.
- **Real-time requires Replication enabled in Supabase** — Settings → Database → Replication → enable for all `r7_ledger_*` tables.
- **Anthropic body size limit** — large PDFs may hit Vercel's 4.5MB body limit. The proxy passes through; if issues arise, may need to chunk or compress.

---

## Roadmap (not yet implemented)

- [ ] Multi-account support (multiple bank accounts per tenant)
- [ ] Recurring transactions (rent, payroll, subscriptions auto-generated)
- [ ] Receipt photo upload (similar to Kitchen invoice scanner) → attach to transaction
- [ ] Multi-currency for Favo Industria/Brewing modules
- [ ] Bank reconciliation (matching deposits to revenue accumulator)
- [ ] Email reports (weekly P&L summary to owner)
- [ ] Plaid integration (Phase 3 — when free tier no longer enough)

---

## Testing Locally

```bash
npm install
cp .env.example .env
# Edit .env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TENANT_ID
npm run dev
```

For PDF import testing locally, you also need to run `vercel dev` instead of `vite dev` so the `/api/anthropic` function works, and have `ANTHROPIC_API_KEY` in `.env`.

---

## Communication Style for Anderson

- Concise, direct recommendations over open-ended options
- Brazilian Portuguese is fine for chat; code/comments in English
- Action-oriented language for American market positioning
- Favo = professional / sophisticated tone
- Always show actual file changes, not just descriptions
- For multi-file changes, copy each output file separately rather than zipping
- Anderson manages the GitHub via web editor (commits via copy-paste) — keep code paste-friendly
