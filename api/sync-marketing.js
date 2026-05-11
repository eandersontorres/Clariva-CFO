// Bridge: Clariva Marketing -> Clariva CFO.
// Reads mkt_ad_snapshots via service role (Marketing has RLS that blocks
// the anon key the browser uses) and returns one accrual-style transaction
// per (ad_account x month), ID-stable so repeated syncs are idempotent.
// When Marketing starts emitting daily snapshots (date_preset='today') we
// can swap the grouping to daily without disturbing existing rows — the
// month-keyed IDs simply stop receiving updates.

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const { tenant_id, start, end } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: accounts, error: accErr } = await supabase
      .from("mkt_ad_accounts")
      .select("id, provider, account_name, currency, status")
      .eq("restaurant_id", tenant_id)
      .eq("status", "connected");

    if (accErr) return res.status(500).json({ error: "Failed to read ad accounts: " + accErr.message });
    if (!accounts || accounts.length === 0) {
      return res.status(200).json({ transactions: [], count: 0, accounts: 0 });
    }

    const accountIds = accounts.map(a => a.id);
    let query = supabase
      .from("mkt_ad_snapshots")
      .select("id, ad_account_id, provider, date_preset, metrics, snapshot_at")
      .in("ad_account_id", accountIds)
      .in("date_preset", ["this_month", "last_30d"])
      .order("snapshot_at", { ascending: false });

    if (start) query = query.gte("snapshot_at", start);
    if (end)   query = query.lte("snapshot_at", end + "T23:59:59.999Z");

    const { data: snapshots, error: snapErr } = await query;
    if (snapErr) return res.status(500).json({ error: "Failed to read snapshots: " + snapErr.message });
    if (!snapshots || snapshots.length === 0) {
      return res.status(200).json({ transactions: [], count: 0, accounts: accounts.length });
    }

    const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    // Pick the most recent snapshot per (ad_account x month).
    const grouped = {};
    for (const snap of snapshots) {
      const month = (snap.snapshot_at || "").slice(0, 7);
      if (!month) continue;
      const key = snap.ad_account_id + "_" + month;
      if (!grouped[key] || grouped[key].snapshot_at < snap.snapshot_at) {
        grouped[key] = snap;
      }
    }

    const todayMonth = new Date().toISOString().slice(0, 7);
    const transactions = Object.values(grouped).map(snap => {
      const month = snap.snapshot_at.slice(0, 7);
      const [yyyy, mm] = month.split("-");
      const lastDay = new Date(parseInt(yyyy, 10), parseInt(mm, 10), 0).getDate();
      const isCurrentMonth = month === todayMonth;
      const date = isCurrentMonth
        ? new Date().toISOString().slice(0, 10)
        : month + "-" + String(lastDay).padStart(2, "0");
      const spend = parseFloat(snap.metrics && snap.metrics.spend) || 0;
      const acc = accMap[snap.ad_account_id];
      const providerLabel = snap.provider === "meta"
        ? "META ADS"
        : snap.provider === "google"
          ? "GOOGLE ADS"
          : (snap.provider || "").toUpperCase();
      const noteParts = ["snapshot " + snap.snapshot_at.slice(0, 10), "date_preset=" + snap.date_preset];
      if (snap.metrics && snap.metrics.impressions) noteParts.push(snap.metrics.impressions + " impressions");
      if (snap.metrics && snap.metrics.clicks)      noteParts.push(snap.metrics.clicks + " clicks");
      if (snap.metrics && snap.metrics.roas)        noteParts.push("ROAS " + snap.metrics.roas);
      return {
        id: "marketing_" + snap.provider + "_" + snap.ad_account_id + "_" + month,
        date,
        description: providerLabel + " — " + month + (acc && acc.account_name ? " · " + acc.account_name.toUpperCase() : ""),
        amount: -Math.abs(spend),
        account: "Marketing Sync",
        category_id: null,
        category: "10", // Uncategorized — see src/lib/constants.js
        reconciled: false,
        source: "marketing_accrual",
        notes: noteParts.join(" · "),
      };
    });

    return res.status(200).json({
      transactions,
      count: transactions.length,
      accounts: accounts.length,
      providers: [...new Set(accounts.map(a => a.provider))],
    });
  } catch (err) {
    console.error("sync-marketing unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
