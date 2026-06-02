// Pulls daily gross sales + Square processing fees per day and writes them as
// ledger transactions, so Total Income reflects revenue recognized at sale
// instead of net cash deposited (which arrives a day or two later already
// shrunk by fees).
//
// Schedule C line 1 (Gross receipts) = sum(source='square_sale_gross')
// Schedule C line 10 (Commissions/Fees) = sum(source='square_fee')
//
// To avoid double-counting against the bank statement imports, any existing
// transaction whose description starts with "SQUARE" and amount is positive
// inside the window gets re-tagged source='square_settlement'. Settlements
// are filtered out of income totals by the client (just like internal
// transfers) so the deposit still appears in the bank's history but doesn't
// inflate revenue.
//
// Tips and auto-gratuity are not counted as sales — they're tracked
// separately in r7_labor_tips_daily and flow through Payroll.

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
    const tenantTz = settings.timezone || "America/Chicago";
    if (!token || !locationId) return res.status(400).json({ error: "Square credentials not configured" });

    const base = sandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - DEFAULT_LOOKBACK_DAYS);
    const beginTime = (start ? new Date(start) : lookbackStart).toISOString();
    const endTime = (end ? new Date(end + "T23:59:59.999Z") : new Date()).toISOString();

    // Resolve category ids for revenue + fees (best-fit by name/taxLine, falls
    // back to null FK so the rows still save).
    const { data: cats } = await supabase
      .from("r7_ledger_accounts")
      .select("id, name, tax_line, type")
      .eq("tenant_id", tenant_id);
    const findCat = (predicate) => (cats || []).find(predicate)?.id || null;
    const revenueCatId = findCat(c => c.name === "Revenue - Dining" || c.tax_line === "Gross Receipts")
      || findCat(c => c.type === "income");
    const feesCatId = findCat(c => c.tax_line === "Commissions and Fees" || /commission|fee/i.test(c.name || ""))
      || findCat(c => c.tax_line === "Other Expenses");

    // Page through payments
    const allPayments = [];
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
      const sqRes = await fetch(`${base}/v2/payments?${qs}`, {
        headers: { "Authorization": "Bearer " + token, "Square-Version": SQUARE_VERSION },
      });
      if (!sqRes.ok) {
        const err = await sqRes.text();
        return res.status(502).json({ error: "Square Payments " + sqRes.status, detail: err.slice(0, 500) });
      }
      const data = await sqRes.json();
      if (Array.isArray(data.payments)) allPayments.push(...data.payments);
      cursor = data.cursor;
    } while (cursor);

    // Aggregate per day. amount_money is the item-side charge (excludes tip),
    // processing_fee[] is Square's cut. Refunded payments contribute negative
    // refunded_money against the day they were refunded for symmetry, but for
    // the MVP we just look at non-refunded gross.
    const byDay = {};
    for (const p of allPayments) {
      const created = p.created_at;
      if (!created) continue;
      // Bucket by the restaurant's local day (America/Chicago for TorresBee),
      // NOT UTC. A restaurant sells at night — payments after ~7pm Central are
      // already the next UTC day, so a naive UTC slice leaks revenue into the
      // following day and breaks reconciliation against the POS (which buckets
      // in local time). en-CA locale yields YYYY-MM-DD.
      const date = new Date(created).toLocaleDateString("en-CA", { timeZone: tenantTz });
      if (!byDay[date]) byDay[date] = { date, gross_cents: 0, fee_cents: 0, refund_cents: 0, payments: 0 };
      const grossCents = p.amount_money?.amount || 0;
      const refundedCents = p.refunded_money?.amount || 0;
      const feeCents = (p.processing_fee || []).reduce((s, f) => s + (f.amount_money?.amount || 0), 0);
      byDay[date].gross_cents += grossCents;
      byDay[date].refund_cents += refundedCents;
      byDay[date].fee_cents += feeCents;
      byDay[date].payments += 1;
    }

    // Build sale + fee rows. Net gross = gross - refunds.
    const rowsToWrite = [];
    for (const day of Object.values(byDay)) {
      const netGross = (day.gross_cents - day.refund_cents) / 100;
      const fees = day.fee_cents / 100;
      if (netGross > 0) {
        rowsToWrite.push({
          id: `sq_sale_${day.date}`,
          tenant_id,
          date: day.date,
          description: `SQUARE SALES — ${day.payments} PAYMENT${day.payments === 1 ? "" : "S"}`,
          amount: Math.round(netGross * 100) / 100,
          category_id: revenueCatId,
          account: "Square POS",
          reconciled: true,
          source: "square_sale_gross",
          notes: day.refund_cents > 0 ? `Refunds: -${(day.refund_cents / 100).toFixed(2)}` : "",
          tags: [],
        });
      }
      if (fees > 0) {
        rowsToWrite.push({
          id: `sq_fee_${day.date}`,
          tenant_id,
          date: day.date,
          description: "SQUARE PROCESSING FEES",
          amount: -Math.round(fees * 100) / 100,
          category_id: feesCatId,
          account: "Square POS",
          reconciled: true,
          source: "square_fee",
          notes: "",
          tags: [],
        });
      }
    }

    if (rowsToWrite.length > 0) {
      const { error: upErr } = await supabase
        .from("r7_ledger_transactions")
        .upsert(rowsToWrite, { onConflict: "id" });
      if (upErr) return res.status(500).json({ error: "upsert sale/fee rows: " + upErr.message });
    }

    // Re-tag bank-side Square settlements so they don't double-count as income.
    // Existing settlements keep their categories, notes and reconciled flag —
    // only the source is rewritten so the client knows to exclude them from
    // income totals.
    //
    // NOTE (PR2): the deterministic source of truth is now the Square Payouts
    // API match in api/sync-square-payouts.js, which links bank deposit ↔
    // payout via payout_id. This regex pass is kept as a fallback for the
    // window between a Square sale recording and the payout actually being
    // issued (and for any edge case the API match misses). It's safe to run
    // both — the payout match already sets source='square_settlement', and
    // this pass simply skips rows that are already tagged.
    const beginDate = beginTime.slice(0, 10);
    const endDate = endTime.slice(0, 10);
    const { data: candidates } = await supabase
      .from("r7_ledger_transactions")
      .select("id, source, description")
      .eq("tenant_id", tenant_id)
      .gte("date", beginDate)
      .lte("date", endDate)
      .gt("amount", 0);
    // Re-tag matches the word "square" anywhere (not just as a prefix), so BoA
    // descriptions like "TRANSFER SQUARE" or "ACH DEPOSIT - SQUARE INC" still
    // get caught. Combined with the `amount > 0` filter above this is safe:
    // expense rows that happen to mention Square (e.g. "SQUARE PROCESSING
    // FEES") are negative and never reach this branch.
    const isSquareDeposit = (desc) => /\bsquare\b|sq\*square|^sq\s|^sq\b/i.test(desc || "");
    const reTagIds = (candidates || [])
      .filter(c => isSquareDeposit(c.description) && c.source !== "square_sale_gross" && c.source !== "square_settlement")
      .map(c => c.id);
    let settlements_retagged = 0;
    if (reTagIds.length > 0) {
      const { error: tagErr } = await supabase
        .from("r7_ledger_transactions")
        .update({ source: "square_settlement" })
        .in("id", reTagIds);
      if (!tagErr) settlements_retagged = reTagIds.length;
    }

    const totals = {
      gross_sales: Math.round(Object.values(byDay).reduce((s, d) => s + d.gross_cents - d.refund_cents, 0)) / 100,
      processing_fees: Math.round(Object.values(byDay).reduce((s, d) => s + d.fee_cents, 0)) / 100,
      refunds: Math.round(Object.values(byDay).reduce((s, d) => s + d.refund_cents, 0)) / 100,
    };

    return res.status(200).json({
      payments_scanned: allPayments.length,
      days_with_sales: Object.keys(byDay).length,
      rows_written: rowsToWrite.length,
      settlements_retagged,
      revenue_category_resolved: !!revenueCatId,
      fees_category_resolved: !!feesCatId,
      totals,
      window: { start: beginDate, end: endDate },
    });
  } catch (err) {
    console.error("sync-square-sales unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
