// Bridge: Clariva Book reservations -> CFO Insights.
// Book has RLS that blocks the anon key the browser holds, so this endpoint
// runs with the service role to pull forward-looking demand and historical
// no-show rate. Avg ticket comes from r7_snapshots (Square POS), which the
// CFO already reads via Kitchen sync but we re-fetch here to ship a single
// payload to the Insights card.

import { createClient } from "@supabase/supabase-js";

const HORIZON_DAYS = 14;            // upcoming window
const NOSHOW_LOOKBACK_DAYS = 60;    // for no-show rate
const TICKET_LOOKBACK_DAYS = 30;    // for avg ticket

function isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const tenant_id = (req.body && req.body.tenant_id) || (req.query && req.query.tenant_id);
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = isoDateOffset(0);
  const horizonEnd = isoDateOffset(HORIZON_DAYS);
  const noShowStart = isoDateOffset(-NOSHOW_LOOKBACK_DAYS);
  const ticketStart = isoDateOffset(-TICKET_LOOKBACK_DAYS);

  try {
    const [upcomingRes, historicalRes, snapshotsRes] = await Promise.all([
      supabase
        .from("r7_reservations")
        .select("id, date, time, party_size, status")
        .eq("tenant_id", tenant_id)
        .in("status", ["pending", "confirmed", "seated"])
        .gte("date", today)
        .lte("date", horizonEnd)
        .order("date", { ascending: true }),
      supabase
        .from("r7_reservations")
        .select("status")
        .eq("tenant_id", tenant_id)
        .gte("date", noShowStart)
        .lt("date", today)
        .in("status", ["completed", "noshow", "cancelled"]),
      supabase
        .from("r7_snapshots")
        .select("avg_ticket, net_sales, orders")
        .eq("tenant_id", tenant_id)
        .gte("date", ticketStart)
        .lte("date", today),
    ]);

    if (upcomingRes.error)   return res.status(500).json({ error: "reservations upcoming: " + upcomingRes.error.message });
    if (historicalRes.error) return res.status(500).json({ error: "reservations history: " + historicalRes.error.message });
    if (snapshotsRes.error)  return res.status(500).json({ error: "snapshots: " + snapshotsRes.error.message });

    const upcoming = upcomingRes.data || [];
    const history  = historicalRes.data || [];
    const snaps    = snapshotsRes.data || [];

    // Upcoming demand by day
    const byDay = {};
    let upcomingCovers = 0;
    for (const r of upcoming) {
      const ps = parseInt(r.party_size, 10) || 0;
      upcomingCovers += ps;
      if (!byDay[r.date]) byDay[r.date] = { date: r.date, covers: 0, reservations: 0 };
      byDay[r.date].covers += ps;
      byDay[r.date].reservations += 1;
    }
    const byDayArr = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    // No-show rate (over last 60d, denominator = completed + noshow, ignore cancelled)
    const completed = history.filter(h => h.status === "completed").length;
    const noshow    = history.filter(h => h.status === "noshow").length;
    const denominator = completed + noshow;
    const noShowRate = denominator > 0 ? noshow / denominator : 0;

    // Avg ticket from snapshots: weighted by orders for accuracy
    const totalOrders = snaps.reduce((s, x) => s + (parseInt(x.orders, 10) || 0), 0);
    const totalNet    = snaps.reduce((s, x) => s + (parseFloat(x.net_sales) || 0), 0);
    const avgTicket = totalOrders > 0 ? totalNet / totalOrders : 0;

    // Project revenue: covers x avg_ticket x (1 - noShowRate)
    const next7Covers = byDayArr
      .filter(d => d.date <= isoDateOffset(7))
      .reduce((s, d) => s + d.covers, 0);
    const projectedRevenue7d = next7Covers * avgTicket * (1 - noShowRate);

    return res.status(200).json({
      window: { start: today, end: horizonEnd, horizon_days: HORIZON_DAYS },
      upcoming: {
        reservations: upcoming.length,
        covers: upcomingCovers,
        by_day: byDayArr,
        covers_next_7d: next7Covers,
      },
      no_show: {
        rate: noShowRate,
        sample_size: denominator,
        lookback_days: NOSHOW_LOOKBACK_DAYS,
      },
      avg_ticket: {
        value: avgTicket,
        based_on_orders: totalOrders,
        lookback_days: TICKET_LOOKBACK_DAYS,
      },
      projected_revenue_7d: projectedRevenue7d,
    });
  } catch (err) {
    console.error("forecast-bookings unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
