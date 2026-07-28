// api/unit-transfer.js
// Moves money between two Favo Bank envelopes (e.g. Operating -> Tax Vault)
// with a Unit bookPayment: internal, instant, $0 fee. This is what turns the
// CFO Insights "set aside $X for sales tax" recommendation into a REAL transfer.
//
// bookPayment semantics (docs.unit.co): `account` is the source, `direction`
// "Debit" moves money OUT of it into `counterpartyAccount` (the destination).

import { authorizeSync, serviceRoleClient } from "./_auth.js";

const UNIT_HOSTS = { sandbox: "https://api.s.unit.sh", production: "https://api.unit.co" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.UNIT_API_TOKEN;
  const env = process.env.UNIT_ENV || "sandbox";
  const base = UNIT_HOSTS[env] || UNIT_HOSTS.sandbox;
  if (!token) return res.status(500).json({ error: "UNIT_API_TOKEN not configured" });

  const supabase = serviceRoleClient();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id, from_purpose, to_purpose, amount, description } = req.body || {};

  // MOVES MONEY between this tenant's Unit accounts. Runs as service role with the
  // Unit org token, so it must verify its caller belongs to this tenant.
  // See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });
  if (!from_purpose || !to_purpose) return res.status(400).json({ error: "from_purpose and to_purpose required" });
  if (from_purpose === to_purpose) return res.status(400).json({ error: "from and to must differ" });
  const cents = Math.round(Number(amount) * 100);
  if (!cents || cents <= 0) return res.status(400).json({ error: "amount must be > 0" });

  try {
    const { data: enroll } = await supabase
      .from("r7_ledger_unit_accounts").select("*").eq("tenant_id", tenant_id).maybeSingle();
    if (!enroll || enroll.status !== "active") return res.status(400).json({ error: "Favo Bank not enrolled" });

    const from = (enroll.accounts || []).find(a => a.purpose === from_purpose);
    const to = (enroll.accounts || []).find(a => a.purpose === to_purpose);
    if (!from || !to) return res.status(400).json({ error: "envelope not found" });

    const r = await fetch(`${base}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({
        data: {
          type: "bookPayment",
          attributes: {
            amount: cents,
            direction: "Debit",                     // out of `account` (from) into counterparty (to)
            description: (description || `${from.name} -> ${to.name}`).slice(0, 50),
            idempotencyKey: `${tenant_id}-${from_purpose}-${to_purpose}-${cents}-${Date.now()}`,
          },
          relationships: {
            account: { data: { type: "depositAccount", id: from.account_id } },
            counterpartyAccount: { data: { type: "depositAccount", id: to.account_id } },
          },
        },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = (data.errors && data.errors[0]) || {}; return res.status(502).json({ error: e.detail || e.title || `Unit payment ${r.status}` }); }

    return res.status(200).json({
      ok: true,
      payment_id: data.data?.id,
      status: data.data?.attributes?.status,
      amount: cents / 100,
      from: from.name,
      to: to.name,
    });
  } catch (err) {
    console.error("unit-transfer unhandled:", err);
    return res.status(500).json({ error: err.message });
  }
}
