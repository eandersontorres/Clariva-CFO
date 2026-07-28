// api/plaid-exchange.js
// Step 2 of the Plaid handshake. The browser finished Plaid Link and got back a
// short-lived public_token. We trade it for the long-lived access_token + item_id,
// pull the account list, and persist everything in r7_ledger_plaid_items via the
// SERVICE ROLE key (RLS-protected table — the browser can never read it).
//
// The access_token is the bank credential. It is returned to the browser NOWHERE
// in this response — only the institution name + a sanitized account list.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = serviceRoleClient();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id, public_token, institution_name, institution_id } = req.body || {};

  // Exchanges a public token for a long-lived Plaid access_token and stores it
  // against this tenant — i.e. it attaches a bank connection. Caller must be a
  // member of the tenant it's attaching to. See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });
  if (!public_token) return res.status(400).json({ error: "public_token required" });

  const clientId = (process.env.PLAID_CLIENT_ID || "").trim();
  const secret = (process.env.PLAID_SECRET || "").trim();
  const env = (process.env.PLAID_ENV || "sandbox").trim();
  const base = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
  if (!clientId || !secret) return res.status(500).json({ error: "PLAID_CLIENT_ID / PLAID_SECRET not configured" });

  try {
    // 1. Exchange public_token -> access_token + item_id
    const exRes = await fetch(`${base}/item/public_token/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, public_token }),
    });
    const exData = await exRes.json();
    if (!exRes.ok) return res.status(502).json({ error: exData.error_message || "Plaid exchange failed", plaid: exData });

    const accessToken = exData.access_token;
    const itemId = exData.item_id;

    // 2. Pull the account list (names/masks) so synced transactions can show a
    //    readable account label.
    let accounts = [];
    let resolvedInstId = institution_id || null;
    const acctRes = await fetch(`${base}/accounts/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }),
    });
    const acctData = await acctRes.json();
    if (acctRes.ok) {
      accounts = (acctData.accounts || []).map(a => ({
        account_id: a.account_id,
        name: a.name,
        official_name: a.official_name || null,
        mask: a.mask || null,
        type: a.type || null,
        subtype: a.subtype || null,
      }));
      resolvedInstId = resolvedInstId || acctData.item?.institution_id || null;
    }

    // 3. Persist (upsert on tenant_id+item_id so re-linking the same bank updates).
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("r7_ledger_plaid_items")
      .upsert({
        tenant_id,
        item_id: itemId,
        access_token: accessToken,
        institution_id: resolvedInstId,
        institution_name: institution_name || "Bank",
        accounts,
        cursor: null,          // null = full backfill on first sync
        status: "active",
        last_error: null,
        updated_at: now,
      }, { onConflict: "tenant_id,item_id" });
    if (upErr) return res.status(500).json({ error: "store plaid item: " + upErr.message });

    return res.status(200).json({
      ok: true,
      item_id: itemId,
      institution_name: institution_name || "Bank",
      accounts: accounts.map(a => ({ name: a.name, mask: a.mask, subtype: a.subtype })),
    });
  } catch (err) {
    console.error("plaid-exchange unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
