// Pulls Square sales data via the Orders API (not Payments) so each day can
// be split into the four ledger entries that actually make accounting sense:
//
//   sq_sale_<date>  → Revenue - Dining
//                    items + non-tip service charges − discounts − returns
//                    This is Schedule C Line 1 (Gross Receipts).
//
//   sq_tax_<date>   → Sales Tax Payable (type='transfer')
//                    Sales tax collected from the customer. Not revenue —
//                    you owe it to the state. Filtered out of P&L by the
//                    transfer-type category check.
//
//   sq_tip_<date>   → Tips Payable (type='transfer')
//                    Customer tips + auto-gratuity. Passthrough — you owe
//                    it to the staff. Same filter as tax.
//
//   sq_fee_<date>   → Square Fees (expense)
//                    Square's processing cut, summed from tender-level
//                    processing_fee_money on each order.
//
// All four rows are idempotent (deterministic ids on `(prefix, date)`).
// Re-running this sync overwrites prior values, so any tenant that has been
// running with the old single-row-per-day model will see the values shift
// from "items + tax" to just "items" the first time the new version runs.
//
// Bank-side Square deposits get re-tagged source='square_settlement' as a
// fallback (see PR2 — the authoritative match lives in sync-square-payouts).
//
// Category resolution:
//   - Revenue - Dining           — by name or tax_line='Gross Receipts'
//   - Sales Tax Payable          — by name AND type='transfer' (required for the tax row)
//   - Tips Payable               — by name AND type='transfer' (required for the tip row)
//   - Commissions and Fees / fees— by tax_line or name match
// If a transfer category is missing the sync skips that row instead of
// silently lumping tax into revenue. The response includes a flag so the
// caller can surface it.

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

    // Resolve all four category ids up front.
    const { data: cats } = await supabase
      .from("r7_ledger_accounts")
      .select("id, name, tax_line, type")
      .eq("tenant_id", tenant_id);
    const findCat = (predicate) => (cats || []).find(predicate)?.id || null;

    const revenueCatId = findCat(c => c.name === "Revenue - Dining" || c.tax_line === "Gross Receipts")
      || findCat(c => c.type === "income");
    const salesTaxCatId = findCat(c => c.type === "transfer" && /sales\s*tax/i.test(c.name || ""));
    const tipsCatId = findCat(c => c.type === "transfer" && /tip/i.test(c.name || ""));
    const feesCatId = findCat(c => c.tax_line === "Commissions and Fees" || /commission|fee/i.test(c.name || ""))
      || findCat(c => c.tax_line === "Other Expenses");

    // ─── Page through orders ────────────────────────────────────────────
    // /v2/orders/search lets us filter by closed_at (the moment the order
    // was finalized — same anchor Square Sales Summary uses). We pull only
    // COMPLETED orders so canceled drafts and abandoned carts don't leak in.
    const allOrders = [];
    let cursor;
    let pages = 0;
    do {
      pages++;
      if (pages > 50) break;
      const body = {
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              closed_at: { start_at: beginTime, end_at: endTime },
            },
            state_filter: {
              states: ["COMPLETED"],
            },
          },
          sort: {
            sort_field: "CLOSED_AT",
            sort_order: "ASC",
          },
        },
        limit: 500,
      };
      if (cursor) body.cursor = cursor;
      const sqRes = await fetch(`${base}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Square-Version": SQUARE_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!sqRes.ok) {
        const err = await sqRes.text();
        return res.status(502).json({ error: "Square Orders " + sqRes.status, detail: err.slice(0, 500) });
      }
      const data = await sqRes.json();
      if (Array.isArray(data.orders)) allOrders.push(...data.orders);
      cursor = data.cursor;
    } while (cursor);

    // ─── Aggregate per local day ────────────────────────────────────────
    // Bucket by the restaurant's local day (America/Chicago for TorresBee),
    // NOT UTC. A restaurant sells at night — orders closed after ~7pm
    // Central are already the next UTC day, so a naive UTC slice leaks
    // revenue into the following day and breaks reconciliation against the
    // Square Dashboard (which also uses local time).
    const cents = (m) => m?.amount || 0;
    const byDay = {};
    for (const order of allOrders) {
      const closed = order.closed_at;
      if (!closed) continue;
      const date = new Date(closed).toLocaleDateString("en-CA", { timeZone: tenantTz });
      if (!byDay[date]) {
        byDay[date] = {
          date,
          orders: 0,
          items_cents: 0,
          non_tip_sc_cents: 0,
          auto_grat_cents: 0,
          tip_cents: 0,
          tax_cents: 0,
          discount_cents: 0,
          return_cents: 0,
          fee_cents: 0,
        };
      }
      const d = byDay[date];
      d.orders += 1;

      // Items: sum gross_sales_money across line items. gross_sales_money
      // is the pre-tax pre-discount price × quantity, which is exactly what
      // Square Sales Summary's "Items" line uses.
      for (const li of order.line_items || []) {
        d.items_cents += cents(li.gross_sales_money);
      }

      // Service charges. ALL of them count as revenue per Square's Sales
      // Summary definition (which is what Anderson uses for the IRS Schedule
      // C top line). Auto-gratuity is a *mandatory* service charge that the
      // restaurant collects and then pays out to staff as part of payroll
      // wages (it appears in the paystub's "Tips Charged" column — the
      // restaurant is the entity of record, so it's revenue then expense,
      // not passthrough). Voluntary tips are tracked separately on the
      // order.tip_money field and DO go to Tips Payable.
      //
      // We still track auto_grat separately so the response surfaces it for
      // reconciliation against the paystub, but it lives in non_tip_sc_cents
      // for the Net Sales math.
      for (const sc of order.service_charges || []) {
        const amt = cents(sc.amount_money);
        d.non_tip_sc_cents += amt;
        const isAutoGrat = sc.type === "AUTO_GRATUITY"
          || /auto.?grat|gratu/i.test(sc.name || "");
        if (isAutoGrat) d.auto_grat_cents += amt;
      }

      // Top-level totals from the order.
      d.tax_cents += cents(order.total_tax_money);
      d.tip_cents += cents(order.total_tip_money);
      d.discount_cents += cents(order.total_discount_money);

      // Returns: line-item refunds attached to the order (rare but real).
      for (const ret of order.returns || []) {
        for (const rli of ret.return_line_items || []) {
          d.return_cents += cents(rli.gross_return_money);
        }
      }

      // Tender-level processing fees. Each card tender carries its own
      // processing_fee_money; cash and Other tenders carry nothing.
      for (const tender of order.tenders || []) {
        for (const fee of tender.processing_fee_money ? [tender.processing_fee_money] : []) {
          d.fee_cents += cents(fee);
        }
      }
    }

    // ─── Build ledger rows ──────────────────────────────────────────────
    // Net Sales — matches Square Sales Summary's "Net sales" line exactly:
    //   Items + ALL service charges (incl. auto-gratuity) − discounts − returns
    // Auto-gratuity is restaurant revenue (then paid out via payroll, where
    // it shows up as "Tips Charged" in the paystub). Voluntary tips on
    // order.tip_money go to Tips Payable as passthrough.
    const rowsToWrite = [];
    let skipped_tax = 0;
    let skipped_tip = 0;
    for (const day of Object.values(byDay)) {
      const netSalesCents = day.items_cents + day.non_tip_sc_cents - day.discount_cents - day.return_cents;
      const tipsTotalCents = day.tip_cents; // voluntary tips only — auto-grat is in Net Sales above

      if (netSalesCents !== 0) {
        rowsToWrite.push({
          id: `sq_sale_${day.date}`,
          tenant_id,
          date: day.date,
          description: `SQUARE NET SALES — ${day.orders} ORDER${day.orders === 1 ? "" : "S"}`,
          amount: Math.round(netSalesCents) / 100,
          category_id: revenueCatId,
          account: "Square POS",
          reconciled: true,
          source: "square_net_sales",
          notes: [
            day.discount_cents > 0 ? `Discounts: -$${(day.discount_cents / 100).toFixed(2)}` : null,
            day.return_cents > 0 ? `Returns: -$${(day.return_cents / 100).toFixed(2)}` : null,
            day.non_tip_sc_cents > 0 ? `Service charges (non-tip): $${(day.non_tip_sc_cents / 100).toFixed(2)}` : null,
          ].filter(Boolean).join(" · "),
          tags: [],
        });
      }
      if (day.tax_cents > 0) {
        if (salesTaxCatId) {
          rowsToWrite.push({
            id: `sq_tax_${day.date}`,
            tenant_id,
            date: day.date,
            description: "SQUARE SALES TAX COLLECTED",
            amount: Math.round(day.tax_cents) / 100,
            category_id: salesTaxCatId,
            account: "Square POS",
            reconciled: true,
            source: "square_sales_tax",
            notes: "Liability — owed to state",
            tags: [],
          });
        } else {
          skipped_tax++;
        }
      }
      if (tipsTotalCents > 0) {
        if (tipsCatId) {
          rowsToWrite.push({
            id: `sq_tip_${day.date}`,
            tenant_id,
            date: day.date,
            description: "SQUARE TIPS + AUTO-GRATUITY",
            amount: Math.round(tipsTotalCents) / 100,
            category_id: tipsCatId,
            account: "Square POS",
            reconciled: true,
            source: "square_tips",
            notes: day.auto_grat_cents > 0
              ? `Tips: $${(day.tip_cents / 100).toFixed(2)} · Auto-grat: $${(day.auto_grat_cents / 100).toFixed(2)}`
              : "",
            tags: [],
          });
        } else {
          skipped_tip++;
        }
      }
      if (day.fee_cents > 0) {
        rowsToWrite.push({
          id: `sq_fee_${day.date}`,
          tenant_id,
          date: day.date,
          description: "SQUARE PROCESSING FEES",
          amount: -Math.round(day.fee_cents) / 100,
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

    // ─── Re-tag bank-side Square settlements (fallback to PR2 payout match) ─
    const beginDate = beginTime.slice(0, 10);
    const endDate = endTime.slice(0, 10);
    const { data: candidates } = await supabase
      .from("r7_ledger_transactions")
      .select("id, source, description")
      .eq("tenant_id", tenant_id)
      .gte("date", beginDate)
      .lte("date", endDate)
      .gt("amount", 0);
    const isSquareDeposit = (desc) => /\bsquare\b|sq\*square|^sq\s|^sq\b/i.test(desc || "");
    const reTagIds = (candidates || [])
      .filter(c => isSquareDeposit(c.description)
        && c.source !== "square_net_sales"
        && c.source !== "square_sale_gross" // legacy rows from before the source rename
        && c.source !== "square_settlement")
      .map(c => c.id);
    let settlements_retagged = 0;
    if (reTagIds.length > 0) {
      const { error: tagErr } = await supabase
        .from("r7_ledger_transactions")
        .update({ source: "square_settlement" })
        .in("id", reTagIds);
      if (!tagErr) settlements_retagged = reTagIds.length;
    }

    // ─── Totals for the response (let the client surface deltas) ────────
    const totals = {
      items: Math.round(Object.values(byDay).reduce((s, d) => s + d.items_cents, 0)) / 100,
      non_tip_service_charges: Math.round(Object.values(byDay).reduce((s, d) => s + d.non_tip_sc_cents, 0)) / 100,
      auto_gratuity: Math.round(Object.values(byDay).reduce((s, d) => s + d.auto_grat_cents, 0)) / 100,
      tips: Math.round(Object.values(byDay).reduce((s, d) => s + d.tip_cents, 0)) / 100,
      tax: Math.round(Object.values(byDay).reduce((s, d) => s + d.tax_cents, 0)) / 100,
      discounts: Math.round(Object.values(byDay).reduce((s, d) => s + d.discount_cents, 0)) / 100,
      returns: Math.round(Object.values(byDay).reduce((s, d) => s + d.return_cents, 0)) / 100,
      processing_fees: Math.round(Object.values(byDay).reduce((s, d) => s + d.fee_cents, 0)) / 100,
    };
    totals.net_sales = Math.round(
      (Object.values(byDay).reduce((s, d) => s + d.items_cents + d.non_tip_sc_cents - d.discount_cents - d.return_cents, 0))
    ) / 100;

    return res.status(200).json({
      orders_scanned: allOrders.length,
      days_with_sales: Object.keys(byDay).length,
      rows_written: rowsToWrite.length,
      settlements_retagged,
      revenue_category_resolved: !!revenueCatId,
      sales_tax_category_resolved: !!salesTaxCatId,
      tips_category_resolved: !!tipsCatId,
      fees_category_resolved: !!feesCatId,
      skipped_tax,
      skipped_tip,
      totals,
      window: { start: beginDate, end: endDate },
    });
  } catch (err) {
    console.error("sync-square-sales unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
