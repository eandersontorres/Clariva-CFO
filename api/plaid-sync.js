// api/plaid-sync.js
// Pulls transactions for every Plaid item connected to the tenant and writes
// them into r7_ledger_transactions as source='plaid'. Driven by the "Sync Bank"
// button. Idempotent: uses Plaid's /transactions/sync cursor + deterministic ids
// (plaid_<transaction_id>) so re-running only applies the delta.
//
// SIGN CONVENTION: Plaid returns `amount` POSITIVE for money leaving the account
// (debit/expense) and NEGATIVE for money entering (credit/income). This app uses
// the opposite (positive = income), so we flip: ledger_amount = -plaid.amount.
//
// Expense transactions are auto-categorized from Plaid's personal_finance_category
// (mapped to the tenant's Chart of Accounts by name). Income/transfer rows are
// left UNCATEGORIZED to avoid double-counting POS revenue already modeled from
// Square. A user-set category is never overwritten on re-sync.

import { createClient } from "@supabase/supabase-js";

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Plaid personal_finance_category -> tenant Chart of Accounts NAME (case-insensitive).
// `detailed` is checked first (sharper), then `primary`. Names that don't exist in
// the tenant's COA simply fall back to uncategorized. EXPENSE side only.
const PFC_DETAILED_TO_NAME = {
  FOOD_AND_DRINK_GROCERIES: "Food & Beverage",
  FOOD_AND_DRINK_RESTAURANT: "Food & Beverage",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Food & Beverage",
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Accounting service",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Accounting service",
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_ADVERTISING_AND_MARKETING: "Marketing",
  GENERAL_SERVICES_AUTOMOTIVE: "Repairs & Maint.",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "Office & Supplies",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Restaurant Supplies",
  RENT_AND_UTILITIES_RENT: "Rent & Utilities",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Rent & Utilities",
  RENT_AND_UTILITIES_WATER: "Rent & Utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Rent & Utilities",
  RENT_AND_UTILITIES_TELEPHONE: "Rent & Utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Rent & Utilities",
  TRANSPORTATION_GAS: "Fuel",
  TRANSPORTATION_PARKING: "Fuel",
  TRANSPORTATION_TOLLS: "Fuel",
  BANK_FEES_ATM_FEES: "Bank Charge",
  BANK_FEES_INSUFFICIENT_FUNDS: "Bank Charge",
  BANK_FEES_OVERDRAFT_FEES: "Bank Charge",
  BANK_FEES_FOREIGN_TRANSACTION_FEES: "Bank Charge",
  BANK_FEES_INTEREST_CHARGE: "Interest Expense",
  HOME_IMPROVEMENT_HARDWARE: "Repairs & Maint.",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Repairs & Maint.",
  LOAN_PAYMENTS_CAR_PAYMENT: "Car Kia",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Loan",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Loan",
  LOAN_PAYMENTS_OTHER_PAYMENT: "Loan",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Annual Texas Tax",
};
const PFC_PRIMARY_TO_NAME = {
  FOOD_AND_DRINK: "Food & Beverage",
  RENT_AND_UTILITIES: "Rent & Utilities",
  BANK_FEES: "Bank Charge",
  TRANSPORTATION: "Fuel",
  LOAN_PAYMENTS: "Loan",
  HOME_IMPROVEMENT: "Repairs & Maint.",
  GENERAL_MERCHANDISE: "Restaurant Supplies",
};

// Merchant-name overrides — checked BEFORE the PFC map because the merchant name
// is sharper than Plaid's generic bucket (e.g. PAYCHEX -> Payroll, which Plaid
// files under a generic transfer). Substring match on the uppercased merchant;
// most specific patterns first (e.g. "GOOGLE ADS" before "GOOGLE").
const MERCHANT_RULES = [
  ["PAYCHEX", "Payroll"],
  ["GOOGLE ADS", "Marketing"],
  ["FACEBOOK", "Marketing"],
  ["META PLATFORMS", "Marketing"],
  ["MICROSOFT", "Subscription"],
  ["ADOBE", "Subscription"],
  ["WIX", "Subscription"],
  ["ANTHROPIC", "Subscription"],
  ["CLAUDE.AI", "Subscription"],
  ["CLAUDE AI", "Subscription"],
  ["SUPABASE", "Subscription"],
  ["GOOGLE", "Subscription"],            // non-ads Google (Workspace, etc.)
  ["ECOLAB", "Restaurant Supplies"],
  ["360TRAINING", "Training"],
  ["CINTAS", "Cintas"],
  ["PUBLIC STORAGE", "Rent & Utilities"],
];

// Returns a category_id for an expense (outflow) txn, or null. Income/transfer
// rows (ledger amount >= 0) are intentionally left uncategorized.
function suggestCategoryId(t, nameToId) {
  if (-Number(t.amount) >= 0) return null; // only outflows
  const desc = String(t.merchant_name || t.name || "").toUpperCase();
  for (const [pat, acct] of MERCHANT_RULES) {
    if (desc.includes(pat)) { const id = nameToId[acct.toLowerCase()]; if (id) return id; }
  }
  const pfc = t.personal_finance_category || {};
  const name = (pfc.detailed && PFC_DETAILED_TO_NAME[pfc.detailed]) ||
               (pfc.primary && PFC_PRIMARY_TO_NAME[pfc.primary]) || null;
  return name ? (nameToId[name.toLowerCase()] || null) : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientId = (process.env.PLAID_CLIENT_ID || "").trim();
  const secret = (process.env.PLAID_SECRET || "").trim();
  const env = (process.env.PLAID_ENV || "sandbox").trim();
  const base = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
  if (!clientId || !secret) return res.status(500).json({ error: "PLAID_CLIENT_ID / PLAID_SECRET not configured" });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: items, error: itemsErr } = await supabase
      .from("r7_ledger_plaid_items")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("status", "active");
    if (itemsErr) return res.status(500).json({ error: "load plaid items: " + itemsErr.message });

    if (!items || items.length === 0) {
      // The button uses this flag to know it must open Plaid Link first.
      return res.status(200).json({ not_connected: true, added: 0, modified: 0, removed: 0 });
    }

    // Chart of Accounts: map account NAME -> id so we can categorize from Plaid's
    // personal_finance_category without hardcoding tenant-specific ids.
    const { data: accounts } = await supabase
      .from("r7_ledger_accounts")
      .select("id, name")
      .eq("tenant_id", tenant_id);
    const nameToId = {};
    for (const a of accounts || []) nameToId[String(a.name).toLowerCase()] = a.id;

    let totalAdded = 0, totalModified = 0, totalRemoved = 0;
    const institutions = [];

    for (const item of items) {
      const acctName = {};
      for (const a of item.accounts || []) acctName[a.account_id] = a.mask ? `${a.name} ••${a.mask}` : a.name;

      const added = [];
      const modified = [];
      const removedIds = [];
      let cursor = item.cursor || null;
      let hasMore = true;
      let guard = 0;
      let plaidError = null;

      while (hasMore && guard < 50) {
        guard++;
        const body = { client_id: clientId, secret, access_token: item.access_token };
        if (cursor) body.cursor = cursor;
        const r = await fetch(`${base}/transactions/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) { plaidError = data.error_message || ("Plaid sync " + r.status); break; }
        for (const t of data.added || []) added.push(t);
        for (const t of data.modified || []) modified.push(t);
        for (const t of data.removed || []) removedIds.push("plaid_" + t.transaction_id);
        cursor = data.next_cursor;
        hasMore = data.has_more;
      }

      if (plaidError) {
        await supabase.from("r7_ledger_plaid_items")
          .update({ status: "error", last_error: plaidError, updated_at: new Date().toISOString() })
          .eq("id", item.id);
        institutions.push({ name: item.institution_name, error: plaidError });
        continue;
      }

      const toRow = (t) => ({
        id: "plaid_" + t.transaction_id,
        tenant_id,
        date: t.date || t.authorized_date,
        description: String(t.merchant_name || t.name || "TRANSACTION").toUpperCase().trim().slice(0, 80),
        amount: -Number(t.amount),                 // flip Plaid's sign -> app convention
        category_id: suggestCategoryId(t, nameToId), // auto-categorize expenses from Plaid PFC
        account: acctName[t.account_id] || item.institution_name || "Plaid",
        account_id: null,
        reconciled: false,
        source: "plaid",
        notes: t.pending ? "Pending — will reconcile when posted" : "",
        tags: [],
      });

      const rows = [...added, ...modified].map(toRow);
      if (rows.length > 0) {
        // Never overwrite a category the user (or a prior sync) already set:
        // fetch existing category_ids and preserve any non-null value.
        const existingCat = {};
        for (const idsCh of chunk(rows.map(r => r.id), 200)) {
          const { data: ex } = await supabase
            .from("r7_ledger_transactions")
            .select("id, category_id")
            .in("id", idsCh);
          for (const e of ex || []) if (e.category_id) existingCat[e.id] = e.category_id;
        }
        for (const r of rows) if (existingCat[r.id]) r.category_id = existingCat[r.id];

        for (const rowsCh of chunk(rows, 200)) {
          const { error: upErr } = await supabase
            .from("r7_ledger_transactions")
            .upsert(rowsCh, { onConflict: "id" });
          if (upErr) return res.status(500).json({ error: "upsert plaid txns: " + upErr.message });
        }
      }
      if (removedIds.length > 0) {
        await supabase.from("r7_ledger_transactions")
          .delete()
          .eq("tenant_id", tenant_id)
          .in("id", removedIds);
      }

      await supabase.from("r7_ledger_plaid_items")
        .update({ cursor, status: "active", last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", item.id);

      // ── Materialize each Plaid account into the Bank Accounts registry so it
      //    appears (with its live balance) alongside manually-added accounts.
      //    Plaid accounts use id prefix plaid_acct_; the frontend shows this
      //    balance directly instead of opening + (date-range-limited) activity.
      try {
        const balRes = await fetch(`${base}/accounts/get`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
        });
        const balData = await balRes.json();
        if (balRes.ok && Array.isArray(balData.accounts)) {
          const asOf = new Date().toISOString().split("T")[0];
          const acctRows = balData.accounts.map((a) => {
            const owed = a.type === "credit" || a.type === "loan"; // liabilities shown negative
            const cur = Number(a.balances?.current ?? 0);
            return {
              id: "plaid_acct_" + a.account_id,
              tenant_id,
              name: a.mask ? `${a.name} ••${a.mask}` : a.name,
              type: a.type === "credit" ? "credit" : a.type === "loan" ? "loan" : (a.subtype === "savings" ? "savings" : "checking"),
              institution: item.institution_name || "Bank",
              opening_balance: Number((owed ? -cur : cur).toFixed(2)),
              opening_date: asOf,
              credit_limit: a.balances?.limit != null ? Number(a.balances.limit) : null,
              status: "active",
              notes: "Synced from Plaid · balance as of " + asOf,
            };
          });
          if (acctRows.length) {
            const { error: accErr } = await supabase
              .from("r7_ledger_bank_accounts")
              .upsert(acctRows, { onConflict: "id" });
            if (accErr) console.error("plaid account upsert:", accErr.message);
          }
        }
      } catch (e) { console.error("plaid account materialize:", e.message); }

      totalAdded += added.length;
      totalModified += modified.length;
      totalRemoved += removedIds.length;
      institutions.push({ name: item.institution_name, added: added.length, modified: modified.length, removed: removedIds.length });
    }

    return res.status(200).json({
      ok: true,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
      institutions,
    });
  } catch (err) {
    console.error("plaid-sync unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
