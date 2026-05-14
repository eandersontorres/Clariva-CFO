// Pulls card tips per employee per day from Square Payments and upserts into
// r7_labor_tips_daily. Re-runs overwrite card_tips and employee_name only —
// any pool_share / pool_method already set by the operator stays intact.
//
// Cash tips are NOT trackeable from Square. Anderson's choice to skip them
// (per the spec) means the system stays clean instead of pretending it knows
// dollars it can't see.

import { createClient } from "@supabase/supabase-js";

const SQUARE_VERSION = "2024-12-18";
const DEFAULT_LOOKBACK_DAYS = 90;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id, start, end } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: tenant } = await supabase.from("r7_tenants").select("settings").eq("id", tenant_id).maybeSingle();
    const settings = tenant?.settings || {};
    const token = settings.sq_token;
    const locationId = settings.sq_location;
    const sandbox = !!settings.sq_sandbox;
    if (!token || !locationId) return res.status(400).json({ error: "Square credentials not configured" });

    const base = sandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - DEFAULT_LOOKBACK_DAYS);
    const beginTime = (start ? new Date(start) : lookbackStart).toISOString();
    const endTime = (end ? new Date(end + "T23:59:59.999Z") : new Date()).toISOString();

    // Page through payments
    const allPayments = [];
    let cursor;
    let pages = 0;
    do {
      pages++;
      if (pages > 30) break;
      const qs = new URLSearchParams({
        location_id: locationId,
        begin_time: beginTime,
        end_time: endTime,
        sort_order: "ASC",
        limit: "100",
      });
      if (cursor) qs.set("cursor", cursor);
      const sqRes = await fetch(`${base}/v2/payments?${qs}`, {
        headers: {
          "Authorization": "Bearer " + token,
          "Square-Version": SQUARE_VERSION,
        },
      });
      if (!sqRes.ok) {
        const err = await sqRes.text();
        return res.status(502).json({ error: "Square API " + sqRes.status, detail: err.slice(0, 500) });
      }
      const data = await sqRes.json();
      if (Array.isArray(data.payments)) allPayments.push(...data.payments);
      cursor = data.cursor;
    } while (cursor);

    // Group: (date, team_member_id) -> sum tip_money in cents
    const byKey = {};
    for (const p of allPayments) {
      const memberId = p.team_member_id;
      const tipCents = p.tip_money?.amount || 0;
      const createdAt = p.created_at || p.updated_at;
      if (!memberId || !createdAt || tipCents <= 0) continue;
      const date = createdAt.slice(0, 10);
      const k = `${date}__${memberId}`;
      if (!byKey[k]) byKey[k] = { date, team_member_id: memberId, cents: 0 };
      byKey[k].cents += tipCents;
    }

    // Resolve team member names once
    const memberIds = [...new Set(Object.values(byKey).map(v => v.team_member_id))];
    const memberMap = {};
    if (memberIds.length > 0) {
      try {
        const teamRes = await fetch(`${base}/v2/team-members/search`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Square-Version": SQUARE_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: { filter: { location_ids: [locationId] } }, limit: 200 }),
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          for (const m of (teamData.team_members || [])) {
            memberMap[m.id] = [m.given_name, m.family_name].filter(Boolean).join(" ").trim() || m.email_address || m.id;
          }
        }
      } catch { /* non-fatal */ }
    }

    // Upsert preserving any existing pool_* fields (don't blow them away)
    const groups = Object.values(byKey);
    let written = 0;
    for (const g of groups) {
      const card = Math.round(g.cents) / 100;
      const { data: existing } = await supabase
        .from("r7_labor_tips_daily")
        .select("id, pool_method, pool_share, pool_participant_count, pool_total")
        .eq("tenant_id", tenant_id)
        .eq("date", g.date)
        .eq("team_member_id", g.team_member_id)
        .maybeSingle();
      const row = {
        tenant_id,
        date: g.date,
        team_member_id: g.team_member_id,
        employee_name: memberMap[g.team_member_id] || existing?.employee_name || null,
        card_tips: card,
        pool_method: existing?.pool_method || "none",
        pool_share: existing?.pool_share || 0,
        pool_participant_count: existing?.pool_participant_count || 0,
        pool_total: existing?.pool_total || 0,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) row.id = existing.id;
      const { error } = await supabase
        .from("r7_labor_tips_daily")
        .upsert(row, { onConflict: "tenant_id,date,team_member_id" });
      if (!error) written++;
    }

    return res.status(200).json({
      payments_scanned: allPayments.length,
      tipped_payments: groups.length,
      employees_with_tips: memberIds.length,
      rows_written: written,
      window: { start: beginTime.slice(0, 10), end: endTime.slice(0, 10) },
    });
  } catch (err) {
    console.error("sync-square-tips unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
