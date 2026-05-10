# Clariva CFO

Bookkeeping & financial intelligence for restaurant operators. Part of the Clariva ecosystem (companion to Clariva Kitchen / Restauran7).

**Live:** [cfo.clariva.cloud](https://cfo.clariva.cloud)

## Stack

- React 18 + Vite 5 (single-file `App.jsx` SPA)
- Vercel Serverless Functions for AI-powered PDF parsing (`/api/*`)
- Supabase (shared project with Clariva Kitchen)
- Anthropic API (via `/api/parse-statement` proxy) for PDF statement extraction

## Features

- Bank statement import — CSV, OFX/QFX (inline parsers), and PDF (AI extraction, up to 20MB)
- Auto-categorization based on prior transaction history
- Chart of Accounts mapped to Schedule C tax lines
- Profit & Loss · Cash Flow · Budget tracking with variance
- Posting workflow with bank/Kitchen invoice auto-matching
- Bills & Accounts Payable with payment tracking
- Sales Report comparing bank deposits to Square POS revenue
- CFO Insights dashboard with health scoring and budget alerts
- Projects & projections for capital planning
- Tax Summary with Schedule C export
- Real-time sync across devices via Supabase channels

## Setup

```bash
cp .env.example .env
# Fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TENANT_ID
# For PDF parsing locally: also set ANTHROPIC_API_KEY (server-side only)
npm install
npm run dev
```

For local PDF testing, run `vercel dev` instead of `vite dev` so the `/api/*` serverless functions execute.

## Database

Run `supabase_migration.sql` in the Supabase SQL Editor to create all `r7_ledger_*` tables. The Kitchen bridge (`r7_purchases`, `r7_snapshots`, `r7_vendors`, etc.) is read-only and assumed to already exist in the shared project.

## Importing Bank Statements

1. Log into Bank of America online banking
2. Go to **Statements & Documents**
3. Download in CSV, OFX/QFX, or PDF format
4. Drag & drop into the Transactions screen — auto-categorization runs automatically based on your history

## Deployment

Auto-deploys from `main` branch via Vercel. Custom domain: `cfo.clariva.cloud` (GoDaddy → Vercel CNAME).
