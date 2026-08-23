// Inbound webhook for delivery-platform payout emails.
//
// DoorDash / UberEats / GrubHub / Wix all email a payout summary every week.
// Every tenant gets its own address — <token>@payouts.clariva.cloud — so
// onboarding is "paste this into the DoorDash portal as a notification
// recipient" and nothing has to be set up per restaurant. Cloudflare Email
// Routing catch-alls the domain into a Worker (infra/cloudflare-email-worker.js)
// which POSTs here.
//
// Two independent credentials, easy to conflate:
//   x-ingest-secret  authenticates the WORKER to this endpoint
//   the address token identifies the TENANT
//
// Deliberately does NOT write the commission/marketing ledger entries. AI
// extraction of a money document gets a human look before it hits the P&L —
// ingested payouts show up in Reconciliation flagged "not posted" and the
// operator posts them there. That's also what contains a forged email: the
// worst case is a bogus row sitting unposted, not a corrupted P&L.
//
// Expected body (JSON):
//   {
//     "to":         "k3f9x2m8qp1w7v4nzb6t@payouts.clariva.cloud",
//     "message_id": "<abc@mail>",      required — the dedupe key
//     "from":       "no-reply@doordash.com",
//     "subject":    "Your weekly payout summary",
//     "spf": "pass", "dmarc": "pass",  optional, from the mail relay
//     "text":       "plain-text body", optional, used when there's no attachment
//     "attachments": [
//       { "filename": "payout.pdf", "content_type": "application/pdf",
//         "content_base64": "JVBERi0..." }
//     ],
//     "tenant_id":  "uuid"             optional override, skips address lookup
//   }

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parseStatement, detectPlatform, senderAllowed } from './_aggregator.js';

export const config = {
  api: {
    bodyParser: {
      // Vercel caps the request body at 4.5MB regardless — this only keeps the
      // parser from rejecting earlier than the platform does.
      sizeLimit: '20mb',
    },
  },
};

// Constant-time compare that tolerates length mismatch (timingSafeEqual throws
// on differing lengths, which would itself leak the length).
const secretMatches = (given, expected) => {
  if (!given || !expected) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
};

const PDF_RE = /\.pdf$/i;
const TEXTLIKE_RE = /\.(csv|tsv|txt)$/i;

// Picks the one attachment worth parsing: a PDF beats a CSV beats nothing.
// Platforms often attach a logo or a footer image too, so filter by extension
// and content type rather than taking attachments[0].
const pickAttachment = (attachments = []) => {
  const usable = attachments.filter((a) => {
    const name = a?.filename || '';
    const type = (a?.content_type || a?.contentType || '').toLowerCase();
    return PDF_RE.test(name) || TEXTLIKE_RE.test(name)
      || type.includes('pdf') || type.includes('csv') || type === 'text/plain';
  });
  return usable.find((a) => PDF_RE.test(a.filename || '') || (a.content_type || '').includes('pdf'))
      || usable[0]
      || null;
};

const attachmentBody = (a) => a?.content_base64 || a?.content || a?.data || null;

// Short stable hash so a payout with no platform id still gets the same row id
// when the same email is delivered twice.
const shortHash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

// "Favo CFO <k3f9x2m@payouts.clariva.cloud>" → "k3f9x2m". Plus-addressing is
// stripped so a tenant can tag their own forwards (token+doordash@…).
const localPart = (addr = '') => {
  const m = String(addr).match(/([^\s<>@,;]+)@[^\s<>,;]+/);
  return m ? m[1].toLowerCase().split('+')[0] : null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expectedSecret = process.env.AGGREGATOR_INGEST_SECRET;
  if (!expectedSecret) return res.status(500).json({ error: 'AGGREGATOR_INGEST_SECRET not configured' });
  if (!secretMatches(req.headers['x-ingest-secret'], expectedSecret)) {
    // Not logged: an unauthenticated caller isn't a tenant, and logging them
    // would let anyone fill the table.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse request body: ' + e.message });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const messageId = body.message_id || body.messageId || null;
  const from = body.from || null;
  const to = body.to || null;
  const subject = body.subject || null;

  // Resolve the tenant from the address it was sent to. The env var is the
  // pre-addressing fallback — it keeps the pilot working if this deploys
  // before supabase_ingest_addresses.sql is applied, which is why the lookup
  // failing is a fall-through rather than an error.
  let tenantId = body.tenant_id || null;
  let token = null;
  let addressKind = 'aggregator_payout';

  if (!tenantId && to) {
    token = localPart(to);
    if (token) {
      const { data, error } = await supabase
        .from('r7_ingest_addresses')
        .select('tenant_id, kind')
        .eq('token', token)
        .eq('active', true)
        .maybeSingle();
      if (error) console.warn('ingest address lookup failed, falling back to env:', error.message);
      if (data) {
        tenantId = data.tenant_id;
        addressKind = data.kind || addressKind;
      }
    }
  }
  if (!tenantId) tenantId = process.env.AGGREGATOR_INGEST_TENANT_ID || null;

  // Every outcome gets a row. Best-effort: a logging failure must never turn a
  // good ingest into a bad response, so this swallows its own errors.
  const logEvent = async (outcome, extra = {}) => {
    try {
      await supabase.from('r7_ingest_events').insert({
        tenant_id: tenantId, token, kind: addressKind,
        message_id: messageId, from_addr: from, to_addr: to, subject,
        outcome, ...extra,
      });
    } catch (e) {
      console.warn('ingest event log failed:', e.message);
    }
  };

  const reject = async (outcome, status, payload, detail) => {
    await logEvent(outcome, { detail: detail || payload.error });
    return res.status(status).json(payload);
  };

  if (!tenantId) {
    return reject('rejected_unknown_address', 404,
      { error: 'No tenant for this address', to },
      `token=${token || '(none)'} not found or inactive`);
  }
  if (!messageId) {
    return reject('parse_failed', 400, { error: 'message_id is required — it is the dedupe key' });
  }

  // The address is semi-public by design, so the sender is the real gate.
  if (!senderAllowed(from)) {
    return reject('rejected_sender', 403,
      { error: 'Sender not on the allowlist for this ingest kind', from },
      `from=${from || '(none)'}`);
  }
  // The relay tells us whether the sender domain actually authorized this mail.
  // Absent verdicts pass — not every relay reports them — but a hard fail is
  // spoofing, and the allowlist above is worthless without this check.
  const authVerdicts = [body.spf, body.dmarc].filter(Boolean).map((v) => String(v).toLowerCase());
  if (authVerdicts.some((v) => v === 'fail' || v === 'softfail')) {
    return reject('rejected_unauthenticated', 403,
      { error: 'Sender failed SPF/DMARC', from },
      `spf=${body.spf || '-'} dmarc=${body.dmarc || '-'}`);
  }

  // Dedupe: mail relays retry, and a forwarded email can arrive twice.
  const { data: seen, error: seenErr } = await supabase
    .from('r7_aggregator_payouts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email_message_id', messageId)
    .limit(1);
  if (seenErr) return res.status(500).json({ error: 'Dedupe check failed: ' + seenErr.message });
  if (seen?.length) {
    await logEvent('duplicate');
    return res.status(200).json({ skipped: true, reason: 'already_ingested', message_id: messageId });
  }

  const attachment = pickAttachment(body.attachments);
  const hint = `${from || ''} ${subject || ''}`;
  const filename = attachment?.filename || `${(subject || 'payout-email').slice(0, 60)}.txt`;

  let pdfBase64 = null;
  let csvText = null;
  if (attachment) {
    const raw = attachmentBody(attachment);
    if (!raw) return reject('no_attachment', 400, { error: `Attachment ${filename} has no content` });
    if (PDF_RE.test(attachment.filename || '') || (attachment.content_type || '').includes('pdf')) {
      pdfBase64 = raw;
    } else {
      csvText = Buffer.from(raw, 'base64').toString('utf8');
    }
  } else if (body.text) {
    // Some platforms put the whole summary in the email body with no file.
    csvText = String(body.text);
  } else {
    return reject('no_attachment', 422, { error: 'No parseable attachment and no text body' });
  }

  const parsed = await parseStatement({
    pdfBase64,
    csvText,
    filename,
    platformHint: hint,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  if (!parsed.ok) {
    const { status, ...err } = parsed;
    delete err.ok;
    return reject('parse_failed', status, { ...err, message_id: messageId },
      `${err.error}${err.detail ? ' — ' + err.detail : ''}`);
  }

  const result = parsed.result;
  // Trust the sender over Claude's guess when the email itself identifies the
  // platform — a DoorDash statement that says "other" still came from DoorDash.
  const platform = detectPlatform(filename, hint) || result.platform || 'other';

  if (!result.payouts.length) {
    return reject('parse_failed', 422,
      { error: 'No payouts found in the statement', platform, message_id: messageId },
      'zero payouts extracted');
  }

  const msgKey = shortHash(messageId);
  const rows = result.payouts.map((p, i) => ({
    id: p.payout_id
      ? `${platform}_${p.payout_id}`
      : `${platform}_${p.arrival_date || 'unknown'}_${msgKey}_${i}`,
    tenant_id: tenantId,
    platform,
    period_start: result.period_start || null,
    period_end:   result.period_end || null,
    arrival_date: p.arrival_date || result.period_end || result.period_start,
    gross_sales:   p.gross_sales,
    commission:    p.commission,
    marketing_fee: p.marketing_fee,
    delivery_fee:  p.delivery_fee,
    refunds:       p.refunds,
    tax_remitted:  p.tax_remitted,
    other_fees:    p.other_fees,
    net_payout:    p.net_payout,
    source: 'email_inbox',
    // email_message_id is UNIQUE in the schema, so only the first row of a
    // multi-payout statement can carry it. That's enough for the dedupe query
    // above; every row keeps the id inside `raw` for audit.
    email_message_id: i === 0 ? messageId : null,
    filename,
    raw: { ...p, email_message_id: messageId, email_from: from, email_subject: subject },
  }));

  const missingDate = rows.filter((r) => !r.arrival_date);
  if (missingDate.length) {
    return reject('parse_failed', 422, {
      error: `${missingDate.length} payout(s) had no usable arrival date — statement needs a manual look`,
      platform,
      message_id: messageId,
    }, 'missing arrival_date');
  }

  const { error: upsertErr } = await supabase
    .from('r7_aggregator_payouts')
    .upsert(rows, { onConflict: 'id' });
  if (upsertErr) {
    return reject('write_failed', 500, { error: 'Upsert failed: ' + upsertErr.message }, upsertErr.message);
  }

  await logEvent('accepted', { filename, platform, payouts_ingested: rows.length });
  if (token) {
    // Drives the "last email received" line on the settings card in Phase 2.
    try {
      await supabase.rpc('r7_touch_ingest_address', { p_token: token });
    } catch (e) {
      console.warn('address touch failed:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    platform,
    tenant_id: tenantId,
    message_id: messageId,
    filename,
    payouts_ingested: rows.length,
    period: { start: result.period_start, end: result.period_end },
    totals: result.totals,
    posted_to_ledger: false,
    note: 'Payouts stored as unposted — review and post them from the Reconciliation screen.',
  });
}
