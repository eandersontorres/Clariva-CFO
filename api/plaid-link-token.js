// api/plaid-link-token.js
// Creates a Plaid Link token — the short-lived token the browser uses to open
// the Plaid Link widget (the secure bank-login popup). No bank credentials ever
// touch our server: the user types them inside Plaid's iframe.
//
// Env vars (Vercel):
//   PLAID_CLIENT_ID   — from Plaid dashboard
//   PLAID_SECRET      — the secret for the active environment
//   PLAID_ENV         — "sandbox" (default) | "development" | "production"
//   PLAID_REDIRECT_URI— (production/OAuth only) e.g. https://cfo.clariva.cloud/
//                       Required for Bank of America, which forces OAuth.
//
// Bank of America note: BoA only works in PLAID_ENV=production with OAuth, and
// the redirect URI must be registered in the Plaid dashboard. In sandbox you log
// in with the fake credentials user_good / pass_good against any test bank.

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";
  const base = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
  if (!clientId || !secret) return res.status(500).json({ error: "PLAID_CLIENT_ID / PLAID_SECRET not configured" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });

  try {
    const body = {
      client_id: clientId,
      secret,
      client_name: "Clariva CFO",
      user: { client_user_id: tenant_id },
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    };
    // OAuth banks (Bank of America, Chase, etc.) require a registered redirect URI.
    if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;

    const r = await fetch(`${base}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error_message || "Plaid link/token/create failed", plaid: data });

    return res.status(200).json({ link_token: data.link_token, expiration: data.expiration, env });
  } catch (err) {
    console.error("plaid-link-token unhandled:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
