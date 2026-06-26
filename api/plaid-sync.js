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
// Transactions land UNCATEGORIZED (category_id = null), exactly like a CSV/PDF
// import, so the existing auto-categorization + Bookkeeper workflow takes over.

import { createClient } from "@supabase/supabase-js";

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";
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
        category_id: null,                         // land uncategorized, like an import
        account: acctName[t.account_id] || item.institution_name || "Plaid",
        account_id: null,
        reconciled: false,
        source: "plaid",
        notes: t.pending ? "Pending — will reconcile when posted" : "",
        tags: [],
      });

      const rows = [...added, ...modified].map(toRow);
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("r7_ledger_transactions")
          .upsert(rows, { onConflict: "id" });
        if (upErr) return res.status(500).json({ error: "upsert plaid txns: " + upErr.message });
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
