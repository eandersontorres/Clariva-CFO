// Extracts payout data from a delivery aggregator's monthly/weekly statement.
// Supports the four platforms TorresBee uses (DoorDash, UberEats, GrubHub,
// Wix Restaurants) plus an "other" fallback. Operator drops the file in the
// Reconciliation screen → AI extracts a structured per-payout list → CFO
// upserts into r7_aggregator_payouts and (optionally) writes the matching
// Delivery Commissions expense adjustment.
//
// Same Anthropic-via-Vercel pattern as parse-statement.js + parse-paystub.js.
// The extraction itself lives in _aggregator.js so the email ingest endpoint
// (ingest-aggregator-email.js) parses statements exactly the same way.

import { parseStatement } from './_aggregator.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let pdfBase64, csvText, filename, platformHint;
  try {
    ({ pdfBase64, csvText, filename, platformHint } = req.body);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse request body: ' + e.message });
  }

  const parsed = await parseStatement({
    pdfBase64,
    csvText,
    filename,
    platformHint,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  if (!parsed.ok) {
    const { status, ...body } = parsed;
    delete body.ok;
    return res.status(status).json(body);
  }

  return res.status(200).json(parsed.result);
}
