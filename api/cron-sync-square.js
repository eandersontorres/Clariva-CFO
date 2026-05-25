// Daily cron — keeps the Square → Finance feed fresh so it never goes stale
// again (the 05-19→05-24 gap happened because the feed was manual-only).
//
// Triggered by Vercel Cron (see vercel.json) at 08:00 UTC = 03:00 America/
// Chicago, after the restaurant closes, so the previous service day is
// complete. Fires the three Square syncs (sales, tips, labor) for the tenant.
// All three are idempotent (deterministic ids / upserts), so re-running is
// safe.
//
// Single-tenant for now (VITE_TENANT_ID). When multi-tenant lands, iterate
// active tenants from clv_tenants / r7_tenants instead.

export default async function handler(req, res) {
  // Vercel sets this header on cron invocations. If CRON_SECRET is configured,
  // require it so the endpoint can't be triggered by arbitrary callers.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
  }

  const tenantId = process.env.VITE_TENANT_ID;
  if (!tenantId || tenantId === "demo") {
    return res.status(400).json({ error: "VITE_TENANT_ID not configured for cron" });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.CFO_PUBLIC_URL || "https://cfo.clariva.cloud");

  const endpoints = ["sync-square-sales", "sync-square-tips", "sync-square-labor"];
  const results = {};
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${base}/api/${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      results[ep] = r.ok ? await r.json() : { error: "HTTP " + r.status, detail: (await r.text()).slice(0, 200) };
    } catch (err) {
      results[ep] = { error: err.message };
    }
  }

  return res.status(200).json({ ran_at: new Date().toISOString(), tenant_id: tenantId, results });
}
