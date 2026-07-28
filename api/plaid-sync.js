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
//
// SOURCE CLASSIFICATION: every row is tagged at ingestion (see classifySource)
// so income/expense roll-ups are correct the moment the sync finishes. This
// used to depend on a re-tag pass at the end of sync-square-sales, which only
// covered that run's window — rows landing between Square syncs stayed
// source='plaid' and were counted as income on top of the Square feed.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

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

// Best merchant label for a transaction. merchant_name is the cleanest but is
// often null on PENDING card transactions (Plaid returns a generic network
// descriptor like "MAIL/TELEPHONE ORDER" in `name`). counterparties frequently
// carries the real merchant even while pending, so we fall back to it before
// the raw name.
function merchantOf(t) {
  if (t.merchant_name) return t.merchant_name;
  if (Array.isArray(t.counterparties) && t.counterparties.length) {
    const m = t.counterparties.find((c) => c && c.type === "merchant") || t.counterparties[0];
    if (m && m.name) return m.name;
  }
  return t.name || "";
}

// ─── SOURCE CLASSIFICATION ───────────────────────────────────────────────────
// Bank rows fall into three buckets that must NOT be counted as income/expense:
//
//   square_settlement  Square paying out into the bank. The revenue was already
//                      booked from the Orders API (sq_sale_/sq_tax_/sq_tip_),
//                      so the deposit is the same dollar arriving. Square's
//                      debits (fee sweeps, chargebacks) are the same story —
//                      sq_fee_ already carries them.
//   internal_transfer  Money moving between the tenant's own accounts. Both
//                      legs are imported, so they net to zero by construction.
//
// Everything else stays source='plaid' and counts normally.
//
// Deposits from delivery aggregators are deliberately NOT in this list: for a
// tenant whose aggregator orders are injected into Square they would be
// double-counted, but TorresBee's are not — its Square deposits reconcile to
// Square gross on their own. They are booked as Revenue - Delivery instead.
const SQUARE_RE = /\bsquare\b|\bsq\s*\*/i;
const AGGREGATOR_RE = /\b(doordash|door\s*dash|ubereats|uber\s*eats|uber|grubhub|grub\s*hub|postmates|seamless)\b/i;
const TRANSFER_RES = [
  /^online payment from chk/i,            // credit leg, lands on a card account
  /^online banking payment to crd/i,      // debit leg, leaves checking
  /^online banking transfer\s+(to|from)/i, // checking <-> savings
];
// Plaid's own labels for own-account movement. Sharper than the descriptor
// when the bank's wording drifts.
const TRANSFER_PFC = new Set(["TRANSFER_IN_ACCOUNT_TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER"]);

function classifySource(t, description) {
  if (SQUARE_RE.test(description)) return "square_settlement";
  if (TRANSFER_RES.some((re) => re.test(description))) return "internal_transfer";
  if (TRANSFER_PFC.has(t.personal_finance_category?.detailed)) return "internal_transfer";
  return "plaid";
}

// Returns a category_id for a txn, or null.
//   - outflows  → merchant rules, then Plaid's personal_finance_category
//   - inflows   → only aggregator deposits (Revenue - Delivery). Everything
//                 else is left uncategorized so it surfaces for review rather
//                 than being guessed into the P&L.
function suggestCategoryId(t, nameToId) {
  const ledgerAmount = -Number(t.amount);
  if (ledgerAmount >= 0) {
    const inflowDesc = merchantOf(t).toUpperCase();
    if (ledgerAmount > 0 && AGGREGATOR_RE.test(inflowDesc)) {
      return nameToId["revenue - delivery"] || null;
    }
    return null;
  }
  const desc = merchantOf(t).toUpperCase();
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

  const supabase = serviceRoleClient();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id } = req.body || {};

  // Before anything tenant-shaped: a logged-in member of this tenant, or the
  // cron wrapper's CRON_SECRET. See api/_auth.js. This runs ahead of the Plaid
  // env checks so an unauthenticated probe can't fingerprint the deployment.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const clientId = (process.env.PLAID_CLIENT_ID || "").trim();
  const secret = (process.env.PLAID_SECRET || "").trim();
  const env = (process.env.PLAID_ENV || "sandbox").trim();
  const base = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
  if (!clientId || !secret) return res.status(500).json({ error: "PLAID_CLIENT_ID / PLAID_SECRET not configured" });

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

      const toRow = (t) => {
        // Pending card charges often carry only a generic network descriptor
        // ("MAIL/TELEPHONE ORDER") with no merchant anywhere. Label those
        // PENDING — the real merchant name arrives when the charge posts and
        // the posted version replaces this row on the next sync.
        const description = (
          t.pending && !t.merchant_name && !(Array.isArray(t.counterparties) && t.counterparties.some((c) => c && c.name))
            ? "PENDING"
            : (merchantOf(t) || "TRANSACTION")
        ).toUpperCase().trim().slice(0, 80);
        return {
          id: "plaid_" + t.transaction_id,
          tenant_id,
          date: t.date || t.authorized_date,
          description,
          amount: -Number(t.amount),                 // flip Plaid's sign -> app convention
          category_id: suggestCategoryId(t, nameToId), // auto-categorize from Plaid PFC / merchant
          account: acctName[t.account_id] || item.institution_name || "Plaid",
          // Same id the account materialize step below writes into
          // r7_ledger_bank_accounts. Without it the client's internal-transfer
          // pairing has nothing to compare and every transfer leg is counted
          // as income or expense.
          account_id: t.account_id ? "plaid_acct_" + t.account_id : null,
          reconciled: false,
          source: classifySource(t, description),
          notes: t.pending ? "Pending — will reconcile when posted" : "",
          tags: [],
        };
      };

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
