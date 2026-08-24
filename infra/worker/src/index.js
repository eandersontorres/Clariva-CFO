// Cloudflare Email Worker — the transport half of the aggregator payout ingest.
//
// Cloudflare Email Routing catch-alls payouts.favo.team into this Worker.
// It turns the raw MIME message into the JSON contract that
// /api/ingest-aggregator-email expects, and POSTs it.
//
// Why a Worker instead of a mail provider's inbound-parse: favo.team is
// already a Cloudflare zone with Email Routing enabled (its MX points at
// route{1,2,3}.mx.cloudflare.net), so this needs no new vendor, no new DNS
// delegation and no per-tenant setup. It's also free with no practical cap.
//
// ── Deploy ───────────────────────────────────────────────────────────────────────────────
// This folder is a Wrangler project — see wrangler.toml for the commands.
// The dashboard editor can't install npm packages (postal-mime below), so
// deploys go through `npx wrangler deploy` from infra/worker/.
//
// After deploying: favo.team → Email Routing → Settings → Subdomains → add
// `payouts`, then Routes → catch-all ON THE SUBDOMAIN → Send to Worker →
// favo-payout-ingest. DO NOT catch-all the apex: favo.team routes real
// company mail, and an apex catch-all would swallow it.
//
// Cloudflare supports subaddressing (RFC 5233), and the endpoint strips the
// `+suffix`, so token+doordash@payouts.favo.team resolves to the same tenant.

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
      // Header From, not the envelope. A Gmail filter-forward rewrites the
      // envelope sender to torresbeebrazil+caf_...@gmail.com (SRS-style), but
      // the header keeps the original no-reply@doordash.com — and the header
      // is what the endpoint's sender allowlist must judge. The envelope
      // rides along for audit.
      from: parsed.from?.address || message.from,
      envelope_from: message.from,
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
