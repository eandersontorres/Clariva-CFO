// Pulls every Square payout (bank-side liquidation) into r7_square_payouts so
// the Reconciliation screen can show payout vs bank deposit side-by-side.
//
// Payouts are the canonical "this much money is hitting the bank on this day"
// record from Square. Reconciling against them is more reliable than the
// regex-based re-tag we do today on bank descriptions, because:
//   - The payout_id is deterministic — no description drift between banks.
//   - We get arrival_date directly, not a guess based on ±2 days.
//   - Failed / on-hold payouts are explicit (status != PAID), so we can flag
//     "Square said it would deposit but didn't" without manual digging.
//
// PR1 (this file) just pulls + stores. The Reconciliation screen does the
// match heuristic in the client for now. PR2 will move the match into a
// server-side cron pass that writes `source='square_settlement'` on the
// matched ledger row + `matched_txn_id` on the payout row.

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

    // Page through payouts. The API is location-scoped and supports cursor
    // pagination identical to /v2/payments.
    const allPayouts = [];
    let cursor;
    let pages = 0;
    do {
      pages++;
      if (pages > 50) break;
      const qs = new URLSearchParams({
        location_id: locationId,
        begin_time: beginTime,
        end_time: endTime,
        sort_order: "ASC",
        limit: "100",
      });
      if (cursor) qs.set("cursor", cursor);
      const sqRes = await fetch(`${base}/v2/payouts?${qs}`, {
        headers: { "Authorization": "Bearer " + token, "Square-Version": SQUARE_VERSION },
      });
      if (!sqRes.ok) {
        const errText = await sqRes.text();
        return res.status(502).json({ error: "Square Payouts " + sqRes.status, detail: errText.slice(0, 500) });
      }
      const data = await sqRes.json();
      if (Array.isArray(data.payouts)) allPayouts.push(...data.payouts);
      cursor = data.cursor;
    } while (cursor);

    // Map to r7_square_payouts rows. Square gives amount in the smallest unit
    // (cents for USD) — convert to decimal dollars to match the rest of the
    // ledger.
    const rows = allPayouts.map(p => ({
      id: p.id,
      tenant_id,
      location_id: p.location_id || locationId,
      arrival_date: p.arrival_date || (p.updated_at || p.created_at || "").slice(0, 10),
      amount: Math.round((p.amount_money?.amount || 0)) / 100,
      currency: p.amount_money?.currency || "USD",
      status: p.status || null,
      destination_type: p.destination?.type || null,
      destination_id: p.destination?.id || null,
      raw: p,
    })).filter(r => r.id && r.arrival_date && r.amount > 0);

    let upserted = 0;
    if (rows.length > 0) {
      const { error: upErr, count } = await supabase
        .from("r7_square_payouts")
        .upsert(rows, { onConflict: "id", count: "exact" });
      if (upErr) return res.status(500).json({ error: "upsert payouts: " + upErr.message });
      upserted = count ?? rows.length;
    }

    return res.status(200).json({
      payouts_scanned: allPayouts.length,
      rows_written: upserted,
      window: { start: beginTime.slice(0, 10), end: endTime.slice(0, 10) },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
