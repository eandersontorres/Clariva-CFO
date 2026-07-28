// Bridge: Favo Book reservations -> CFO Insights.
// Book has RLS that blocks the anon key the browser holds, so this endpoint
// runs with the service role to pull forward-looking demand and historical
// no-show rate. Avg ticket comes from r7_snapshots (Square POS), which the
// CFO already reads via Kitchen sync but we re-fetch here to ship a single
// payload to the Insights card.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

const HORIZON_DAYS = 14;            // upcoming window
const NOSHOW_LOOKBACK_DAYS = 60;    // for no-show rate
// avg_ticket source is currently unavailable — r7_snapshots is an inventory
// snapshot table (label/counts JSONB), not Square POS revenue. When pos_orders
// starts receiving data (Favo POS launch), wire it back in here.

function isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = serviceRoleClient();
  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const tenant_id = (req.body && req.body.tenant_id) || (req.query && req.query.tenant_id);

  // Runs as service role to get past RLS on r7_reservations, so it has to
  // check its own caller. See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  const today = isoDateOffset(0);
  const horizonEnd = isoDateOffset(HORIZON_DAYS);
  const noShowStart = isoDateOffset(-NOSHOW_LOOKBACK_DAYS);

  try {
    const [upcomingRes, historicalRes] = await Promise.all([
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
    ]);

    if (upcomingRes.error)   return res.status(500).json({ error: "reservations upcoming: " + upcomingRes.error.message });
    if (historicalRes.error) return res.status(500).json({ error: "reservations history: " + historicalRes.error.message });

    const upcoming = upcomingRes.data || [];
    const history  = historicalRes.data || [];

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

    const next7Covers = byDayArr
      .filter(d => d.date <= isoDateOffset(7))
      .reduce((s, d) => s + d.covers, 0);

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
      avg_ticket: { value: 0, based_on_orders: 0, note: "no POS data source yet" },
      projected_revenue_7d: 0,
    });
  } catch (err) {
    console.error("forecast-bookings unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
