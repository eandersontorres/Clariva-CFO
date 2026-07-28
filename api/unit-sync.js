// api/unit-sync.js
// Pulls transactions for every Favo Bank (Unit) envelope into
// r7_ledger_transactions as source='unit'. Driven by the "Sync Favo Bank"
// button. Idempotent: deterministic ids (unit_<transactionId>) + a per-tenant
// `since` cursor, so re-running only applies the delta. Mirrors api/plaid-sync.js.
//
// SIGN CONVENTION: Unit tags each transaction with direction "Credit" (money in)
// or "Debit" (money out) and a positive `amount` in cents. This app uses
// positive = income, so: ledger_amount = (direction === "Credit" ? +1 : -1) * amount/100.
//
// Transactions land UNCATEGORIZED (category_id = null) so the existing
// auto-categorization + Bookkeeper workflow takes over — same as a Plaid import.
//
// Because these accounts ARE the Favo ledger's bank, reconciliation is
// trivial: the transaction is born inside r7_ledger_transactions.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

const UNIT_HOSTS = { sandbox: "https://api.s.unit.sh", production: "https://api.unit.co" };
const PAGE = 100;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.UNIT_API_TOKEN;
  const env = process.env.UNIT_ENV || "sandbox";
  const base = UNIT_HOSTS[env] || UNIT_HOSTS.sandbox;
  if (!token) return res.status(500).json({ error: "UNIT_API_TOKEN not configured" });

  const supabase = serviceRoleClient();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id } = req.body || {};

  // Pulls this tenant's Unit transactions into the ledger. Runs as service role with the
  // Unit org token, so it must verify its caller belongs to this tenant.
  // See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  try {
    const { data: enroll } = await supabase
      .from("r7_ledger_unit_accounts").select("*").eq("tenant_id", tenant_id).maybeSingle();

    if (!enroll || enroll.status !== "active") {
      // The button uses this flag to know it must open enrollment first.
      return res.status(200).json({ not_enrolled: true, added: 0, modified: 0 });
    }

    const unitGet = async (path) => {
      const r = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = (data.errors && data.errors[0]) || {}; throw new Error(e.detail || e.title || `Unit ${path} ${r.status}`); }
      return data;
    };

    const since = enroll.cursor || null;            // ISO timestamp of last sync
    const acctName = {};
    for (const a of enroll.accounts || []) acctName[a.account_id] = a.name;

    const rows = [];
    let newCursor = since;

    for (const a of enroll.accounts || []) {
      let offset = 0, hasMore = true, guard = 0;
      while (hasMore && guard < 50) {
        guard++;
        let path = `/transactions?filter[accountId]=${a.account_id}&page[limit]=${PAGE}&page[offset]=${offset}&sort=-createdAt`;
        if (since) path += `&filter[since]=${encodeURIComponent(since)}`;
        const data = await unitGet(path);
        const batch = data.data || [];
        for (const t of batch) {
          const at = t.attributes || {};
          const cents = Number(at.amount || 0);
          const signed = (at.direction === "Credit" ? 1 : -1) * cents / 100;
          const createdAt = at.createdAt || new Date().toISOString();
          if (!newCursor || createdAt > newCursor) newCursor = createdAt;
          rows.push({
            id: "unit_" + t.id,
            tenant_id,
            date: createdAt.slice(0, 10),
            description: String(at.summary || at.description || "TRANSACTION").toUpperCase().trim().slice(0, 80),
            amount: signed,
            category_id: null,
            account: acctName[a.account_id] || "Favo Bank",
            account_id: null,
            reconciled: true,                 // born inside the ledger's own bank
            source: "unit",
            notes: at.direction === "Credit" ? "" : "",
            tags: [],
          });
        }
        hasMore = batch.length === PAGE;
        offset += PAGE;
      }
    }

    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from("r7_ledger_transactions").upsert(rows, { onConflict: "id" });
      if (upErr) return res.status(500).json({ error: "upsert unit txns: " + upErr.message });
    }

    await supabase.from("r7_ledger_unit_accounts")
      .update({ cursor: newCursor, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenant_id);

    return res.status(200).json({ ok: true, added: rows.length, modified: 0 });
  } catch (err) {
    console.error("unit-sync unhandled:", err);
    return res.status(500).json({ error: err.message });
  }
}
