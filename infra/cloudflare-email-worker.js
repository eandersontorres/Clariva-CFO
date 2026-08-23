// Cloudflare Email Worker — the transport half of the aggregator payout ingest.
//
// Cloudflare Email Routing catch-alls payouts.clariva.cloud into this Worker.
// It turns the raw MIME message into the JSON contract that
// /api/ingest-aggregator-email expects, and POSTs it.
//
// Why a Worker instead of a mail provider's inbound-parse: Email Routing is
// free with no practical volume cap, and delegating NS for the payouts
// subdomain leaves the apex clariva.cloud alone at GoDaddy.
//
// ── Deploy ───────────────────────────────────────────────────────────────────
//   1. Cloudflare → add site → clariva.cloud is NOT moved; instead delegate
//      only the subdomain: at GoDaddy add NS records for `payouts` pointing at
//      the Cloudflare nameservers for the zone payouts.clariva.cloud.
//   2. Cloudflare → Email → Email Routing → enable for payouts.clariva.cloud
//      (it writes its own MX + SPF records into that zone).
//   3. Workers & Pages → create Worker → paste this file → deploy.
//   4. Worker → Settings → Variables:
//        INGEST_URL     https://cfo.clariva.cloud/api/ingest-aggregator-email
//        INGEST_SECRET  (same value as AGGREGATOR_INGEST_SECRET on Vercel — secret)
//      INGEST_URL must be the custom domain. *.vercel.app is behind Vercel
//      Authentication in this org and answers 401 to anything server-to-server.
//   5. Email Routing → Routes → catch-all → Send to Worker → this Worker.
//
// ── Install a dependency ─────────────────────────────────────────────────────
// MIME parsing is not something to hand-roll. Add postal-mime:
//   npm i postal-mime      (in the Worker project, or via the dashboard editor)

import PostalMime from 'postal-mime';

// Cloudflare caps a Worker's outbound request body; keep well under the 4.5MB
// Vercel accepts. A statement bigger than this goes through manual upload.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const toBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // Chunked so a multi-MB attachment doesn't blow the argument limit of
  // String.fromCharCode with a spread.
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

export default {
  async email(message, env) {
    const raw = new Response(message.raw);
    const parsed = await PostalMime.parse(await raw.arrayBuffer());

    const attachments = (parsed.attachments || [])
      .filter((a) => a.content && a.content.byteLength <= MAX_ATTACHMENT_BYTES)
      .map((a) => ({
        filename: a.filename || 'attachment',
        content_type: a.mimeType || 'application/octet-stream',
        content_base64: toBase64(a.content),
      }));

    // Cloudflare exposes the verdicts it computed during delivery. The ingest
    // endpoint rejects a hard fail — without this the sender allowlist there is
    // just a list of strings anyone can put in a From header.
    const authResults = message.headers.get('authentication-results') || '';
    const verdict = (mech) => {
      const m = authResults.match(new RegExp(mech + '=(\\w+)', 'i'));
      return m ? m[1].toLowerCase() : null;
    };

    const payload = {
      to: message.to,
      from: message.from,
      subject: parsed.subject || message.headers.get('subject') || null,
      message_id: message.headers.get('message-id') || parsed.messageId || null,
      spf: verdict('spf'),
      dmarc: verdict('dmarc'),
      text: parsed.text || null,
      attachments,
    };

    const res = await fetch(env.INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-secret': env.INGEST_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Bounce so the platform (and Cloudflare's own logs) show the failure
      // instead of the email vanishing. The endpoint already recorded the
      // reason in r7_ingest_events for anything it could attribute to a tenant.
      const detail = (await res.text()).slice(0, 200);
      console.error('ingest rejected', res.status, detail);
      message.setReject(`Favo CFO ingest failed (${res.status})`);
    }
  },
};
