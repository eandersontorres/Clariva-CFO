// api/unit-accounts.js
// Read-through proxy for the Favo Bank screen. Returns the tenant's enrollment
// state + LIVE balances for each envelope + card status. The browser calls this
// instead of Unit directly (the org token stays server-side).
//
// Balances come straight from Unit (source of truth), in cents -> dollars.

import { createClient } from "@supabase/supabase-js";

const UNIT_HOSTS = { sandbox: "https://api.s.unit.sh", production: "https://api.unit.co" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.UNIT_API_TOKEN;
  const env = process.env.UNIT_ENV || "sandbox";
  const base = UNIT_HOSTS[env] || UNIT_HOSTS.sandbox;
  if (!token) return res.status(500).json({ error: "UNIT_API_TOKEN not configured" });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: enroll } = await supabase
      .from("r7_ledger_unit_accounts").select("*").eq("tenant_id", tenant_id).maybeSingle();

    if (!enroll || enroll.status !== "active") {
      return res.status(200).json({ enrolled: false, status: enroll?.status || "none", last_error: enroll?.last_error || null });
    }

    const unitGet = async (path) => {
      const r = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = (data.errors && data.errors[0]) || {}; throw new Error(e.detail || e.title || `Unit ${path} ${r.status}`); }
      return data;
    };

    // Fetch each envelope's live balance. Unit balances are in cents.
    const envelopes = [];
    let totalAvailable = 0;
    for (const a of enroll.accounts || []) {
      try {
        const acc = await unitGet(`/accounts/${a.account_id}`);
        const at = acc.data.attributes || {};
        const available = (at.available ?? at.balance ?? 0) / 100;
        const balance = (at.balance ?? 0) / 100;
        totalAvailable += available;
        envelopes.push({
          account_id: a.account_id, purpose: a.purpose, name: a.name,
          routing: a.routing, account_number_masked: a.account_number_masked,
          balance, available, status: at.status || "Open",
        });
      } catch (e) {
        envelopes.push({ account_id: a.account_id, purpose: a.purpose, name: a.name, error: e.message });
      }
    }

    return res.status(200).json({
      enrolled: true,
      status: enroll.status,
      total_available: totalAvailable,
      envelopes,
      card: enroll.card_id ? { id: enroll.card_id, last4: enroll.card_last4 } : null,
      last_synced_at: enroll.last_synced_at,
    });
  } catch (err) {
    console.error("unit-accounts unhandled:", err);
    return res.status(500).json({ error: err.message });
  }
}
