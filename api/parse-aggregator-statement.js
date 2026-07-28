// Extracts payout data from a delivery aggregator's monthly/weekly statement.
// Supports the four platforms TorresBee uses (DoorDash, UberEats, GrubHub,
// Wix Restaurants) plus an "other" fallback. Operator drops the file in the
// Reconciliation screen → AI extracts a structured per-payout list → CFO
// upserts into r7_aggregator_payouts and (optionally) writes the matching
// Delivery Commissions expense adjustment.
//
// Same Anthropic-via-Vercel pattern as parse-statement.js + parse-paystub.js,
// but tuned for the aggregator domain — each platform's report layout is
// different so the prompt walks Claude through the common fields and asks
// for a normalized envelope back.

import { authorizeSession } from './_auth.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

const num = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[$,()]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const detectPlatform = (filename = '', hint = '') => {
  const s = (filename + ' ' + hint).toLowerCase();
  if (/doordash|caviar/.test(s)) return 'doordash';
  if (/uber\s*eats|uber-eats|uber_eats|ubereats/.test(s)) return 'ubereats';
  if (/grubhub|seamless/.test(s)) return 'grubhub';
  if (/wix|wixpayments|wixmam/.test(s)) return 'wix';
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // No tenant to scope to, but every call bills Anthropic tokens. Require a
  // real logged-in operator.
  const auth = await authorizeSession(req, res);
  if (!auth.ok) return;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  let pdfBase64, csvText, filename, platformHint;
  try {
    ({ pdfBase64, csvText, filename, platformHint } = req.body);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse request body: ' + e.message });
  }

  if (!pdfBase64 && !csvText) {
    return res.status(400).json({ error: 'Either pdfBase64 or csvText is required' });
  }

  const platform = detectPlatform(filename || '', platformHint || '');

  // Per-platform hints help Claude pick the right column names. Each block is
  // optional — without it the prompt falls back to generic instructions.
  const platformHints = {
    doordash: 'DoorDash uses columns like "Subtotal", "Commission", "Marketing fee", "Delivery fee", "Refunds", "Tax remitted", "Net payout". Payout id is "Settlement ID".',
    ubereats: 'Uber Eats uses "Sales", "Eats Marketplace fee", "Delivery fee", "Service fee", "Refunds", "Net Payout". Payout id is "Payment ID" or "Transfer ID".',
    grubhub:  'GrubHub uses "Order subtotal", "Commission", "Marketing", "Tax", "Adjustments", "Total paid to restaurant". Payout id is "Reference Number".',
    wix:      'Wix Restaurants uses "Sales", "Processing fee", "Refunds", "Net". Payout id is "Payout ID" or "Transaction ID".',
  };

  const platformLine = platform && platformHints[platform]
    ? `Platform hint: ${platform.toUpperCase()} — ${platformHints[platform]}`
    : 'Platform: unknown — figure out which delivery platform this is from the headers.';

  const prompt = `You're extracting payout details from a food-delivery platform statement.
${platformLine}

Return ONLY a JSON object — no preamble, no markdown. Schema:

{
  "platform": "doordash" | "ubereats" | "grubhub" | "wix" | "other",
  "period_start": "YYYY-MM-DD" | null,
  "period_end":   "YYYY-MM-DD" | null,
  "payouts": [
    {
      "payout_id":     "platform-specific id, or null",
      "arrival_date":  "YYYY-MM-DD",
      "gross_sales":   <number>,
      "commission":    <number>,
      "marketing_fee": <number>,
      "delivery_fee":  <number>,
      "refunds":       <number>,
      "tax_remitted":  <number>,
      "other_fees":    <number>,
      "net_payout":    <number>
    }
  ],
  "totals": {
    "gross_sales":   <number>,
    "commission":    <number>,
    "marketing_fee": <number>,
    "delivery_fee":  <number>,
    "refunds":       <number>,
    "tax_remitted":  <number>,
    "other_fees":    <number>,
    "net_payout":    <number>
  }
}

Rules:
- All money values are POSITIVE numbers (no signs, no parentheses).
- net_payout = gross_sales − commission − marketing_fee − refunds − other_fees + delivery_fee_passthrough (varies per platform).
- If a field isn't in the document, use 0 (don't invent it).
- Skip any row that's clearly a heading, footer, or total (totals go in the top-level "totals" key).
- If the report covers ONE payout, "payouts" is a single-element array.

Output only the JSON object.`;

  try {
    const content = [{ type: 'text', text: prompt }];
    if (pdfBase64) {
      content.unshift({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      });
    } else if (csvText) {
      // For CSV, include it inline in the prompt
      content[0].text = prompt + '\n\nSTATEMENT CSV:\n\n' + csvText;
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      }),
    });

    const rawBody = await anthropicRes.text();
    if (!anthropicRes.ok) {
      return res.status(502).json({
        error: 'Anthropic API error ' + anthropicRes.status,
        detail: rawBody.slice(0, 300),
      });
    }

    let apiData;
    try { apiData = JSON.parse(rawBody); }
    catch { return res.status(502).json({ error: 'Invalid response from Anthropic', detail: rawBody.slice(0, 200) }); }

    const rawText = (apiData.content?.[0]?.text || '').trim();
    if (!rawText) return res.status(422).json({ error: 'Empty response — statement may be unreadable.' });

    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return res.status(422).json({ error: 'AI did not return a JSON object.', preview: rawText.slice(0, 400) });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
    } catch (e) {
      return res.status(422).json({ error: 'Could not parse AI response.', detail: e.message, preview: rawText.slice(0, 300) });
    }

    // Normalize each payout — strip dollar signs / commas, ensure numbers, fill defaults
    const normalize = (p) => ({
      payout_id:     p.payout_id || null,
      arrival_date:  p.arrival_date || null,
      gross_sales:   num(p.gross_sales),
      commission:    num(p.commission),
      marketing_fee: num(p.marketing_fee),
      delivery_fee:  num(p.delivery_fee),
      refunds:       num(p.refunds),
      tax_remitted:  num(p.tax_remitted),
      other_fees:    num(p.other_fees),
      net_payout:    num(p.net_payout),
    });

    const result = {
      platform:     parsed.platform || platform || 'other',
      period_start: parsed.period_start || null,
      period_end:   parsed.period_end || null,
      filename:     filename || null,
      payouts:      Array.isArray(parsed.payouts) ? parsed.payouts.map(normalize) : [],
      totals:       parsed.totals ? {
        gross_sales:   num(parsed.totals.gross_sales),
        commission:    num(parsed.totals.commission),
        marketing_fee: num(parsed.totals.marketing_fee),
        delivery_fee:  num(parsed.totals.delivery_fee),
        refunds:       num(parsed.totals.refunds),
        tax_remitted:  num(parsed.totals.tax_remitted),
        other_fees:    num(parsed.totals.other_fees),
        net_payout:    num(parsed.totals.net_payout),
      } : null,
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error('parse-aggregator-statement unhandled:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
