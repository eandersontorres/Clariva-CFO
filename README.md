# Clariva Ledger

Bookkeeping platform for restaurant operators. Part of the Clariva ecosystem.

**Live:** [bookkeeper.clariva.cloud](https://bookkeeper.clariva.cloud)

## Stack

- React 18 + Vite 5
- Supabase (shared with Clariva Kitchen)
- Deployed on Vercel (Pro)

## Features

- 📁 CSV / OFX import from Bank of America
- 📂 Chart of Accounts (customizable, Schedule C mapped)
- 📊 Profit & Loss (monthly / quarterly / annual)
- 💵 Cash Flow Statement
- 💰 Budget builder with variance tracking
- 🔁 Invoice reconciliation (linked to Kitchen invoices)
- 🧾 Tax Summary with Schedule C export

## Setup

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TENANT_ID
npm install
npm run dev
```

## Database

Run `supabase_migration.sql` in Supabase SQL Editor to create all `r7_ledger_*` tables.

## Importing Bank Statements

1. Log into Bank of America online banking
2. Go to **Statements & Documents**
3. Download in **CSV** or **OFX/QFX** format
4. Drag and drop into the Transactions screen

## Deployment

Auto-deploys from `main` branch via Vercel. Custom domain: `bookkeeper.clariva.cloud`
