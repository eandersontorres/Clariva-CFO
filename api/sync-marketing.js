// Bridge: Favo Marketing -> Favo CFO.
// Reads mkt_ad_snapshots via service role (Marketing has RLS that blocks
// the anon key the browser uses) and returns one accrual-style transaction
// per (ad_account x month), ID-stable so repeated syncs are idempotent.
// When Marketing starts emitting daily snapshots (date_preset='today') we
// can swap the grouping to daily without disturbing existing rows — the
// month-keyed IDs simply stop receiving updates.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = serviceRoleClient();
  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const { tenant_id, start, end } = req.body || {};

  // Runs as service role to get past RLS on the mkt_* tables, so it has to
  // check its own caller. See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  try {
    // r7_tenants and mkt_restaurants are separate tables with their own UUIDs.
    // They line up by slug, not by id — resolve via slug to find the matching
    // mkt_restaurants.id, which is what mkt_ad_accounts.restaurant_id points to.
    const { data: tenant, error: tenErr } = await supabase
      .from("r7_tenants")
      .select("slug")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tenErr) return res.status(500).json({ error: "tenant lookup: " + tenErr.message });
    if (!tenant || !tenant.slug) return res.status(200).json({ transactions: [], count: 0, accounts: 0, note: "no tenant slug" });

    const { data: restaurant, error: restErr } = await supabase
      .from("mkt_restaurants")
      .select("id")
      .eq("slug", tenant.slug)
      .maybeSingle();
    if (restErr) return res.status(500).json({ error: "mkt_restaurants lookup: " + restErr.message });
    if (!restaurant) return res.status(200).json({ transactions: [], count: 0, accounts: 0, note: "no matching mkt_restaurants slug=" + tenant.slug });

    const restaurantId = restaurant.id;

    const { data: accounts, error: accErr } = await supabase
      .from("mkt_ad_accounts")
      .select("id, provider, account_name, currency, status")
      .eq("restaurant_id", restaurantId)
      .in("status", ["connected", "error"]);

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
