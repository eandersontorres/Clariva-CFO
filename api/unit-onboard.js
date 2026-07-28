// api/unit-onboard.js
// "Open Favo Bank account" — the one-time enrollment for a tenant.
// Creates a Unit business customer, then 3 deposit-account "envelopes"
// (operating / tax_vault / payroll) and a virtual debit card, and stores the
// non-secret references in r7_ledger_unit_accounts (service-role only).
//
// SECRET MODEL: the Unit org token (UNIT_API_TOKEN) is the bank credential. It
// lives only here on the server and is never returned to the browser — same as
// the Plaid access_token. The browser only ever sees ids, balances, masks.
//
// SANDBOX: business applications auto-approve, so the customer id is available
// immediately. The default test profile below lets you click "Open account"
// with zero data entry. For LIVE, the real KYB profile (EIN, officer SSN,
// beneficial owners) must be collected and Unit + the partner bank approve it.
//
// Unit uses JSON:API (Content-Type: application/vnd.api+json). The request
// shapes below follow docs.unit.co; verify exact required fields against your
// sandbox before go-live, as Unit occasionally adds required KYB attributes.

import { authorizeSync, serviceRoleClient } from "./_auth.js";

const UNIT_HOSTS = { sandbox: "https://api.s.unit.sh", production: "https://api.unit.co" };

// Envelopes created on enrollment. The CFO Insights engine decides how much to
// move into tax_vault / payroll; this just creates the buckets to move into.
const ENVELOPES = [
  { purpose: "operating", name: "Operating",       deposit_product: "checking" },
  { purpose: "tax_vault", name: "Tax Vault",       deposit_product: "checking" },
  { purpose: "payroll",   name: "Payroll Reserve", deposit_product: "checking" },
];

// Minimal sandbox test profile (Unit's published test values auto-approve).
function sandboxProfile(tenant_id) {
  return {
    name: "Favo Pilot LLC",
    stateOfIncorporation: "TX",
    entityType: "LLC",
    ein: "123456789",
    address: { street: "1500 W Round Rock Ave", city: "Round Rock", state: "TX", postalCode: "78681", country: "US" },
    phone: { countryCode: "1", number: "5125551234" },
    contact: {
      fullName: { first: "Anderson", last: "Torres" },
      email: "pilot@clariva.cloud",
      phone: { countryCode: "1", number: "5125551234" },
    },
    officer: {
      fullName: { first: "Anderson", last: "Torres" },
      dateOfBirth: "1990-01-01",
      ssn: "721074426",
      email: "pilot@clariva.cloud",
      phone: { countryCode: "1", number: "5125551234" },
      address: { street: "1500 W Round Rock Ave", city: "Round Rock", state: "TX", postalCode: "78681", country: "US" },
    },
    beneficialOwners: [{
      fullName: { first: "Anderson", last: "Torres" },
      dateOfBirth: "1990-01-01",
      ssn: "721074426",
      address: { street: "1500 W Round Rock Ave", city: "Round Rock", state: "TX", postalCode: "78681", country: "US" },
      phone: { countryCode: "1", number: "5125551234" },
      email: "pilot@clariva.cloud",
    }],
    tags: { tenant_id },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.UNIT_API_TOKEN;
  const env = process.env.UNIT_ENV || "sandbox";
  const base = UNIT_HOSTS[env] || UNIT_HOSTS.sandbox;
  if (!token) return res.status(500).json({ error: "UNIT_API_TOKEN not configured" });

  const supabase = serviceRoleClient();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const { tenant_id, profile } = req.body || {};

  // Creates a Unit application/account for this tenant. Runs as service role with the
  // Unit org token, so it must verify its caller belongs to this tenant.
  // See api/_auth.js.
  const auth = await authorizeSync(req, res, tenant_id, supabase);
  if (!auth.ok) return;

  if (!tenant_id) return res.status(400).json({ error: "tenant_id required" });


  // Thin JSON:API wrapper. Returns parsed { data, included } or throws with the
  // Unit error title/detail (Unit returns { errors: [{title, detail}] }).
  const unit = async (path, { method = "GET", body } = {}) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = (data.errors && data.errors[0]) || {};
      throw new Error(e.detail || e.title || `Unit ${path} ${r.status}`);
    }
    return data;
  };

  try {
    // Don't double-enroll.
    const { data: existing } = await supabase
      .from("r7_ledger_unit_accounts").select("*").eq("tenant_id", tenant_id).maybeSingle();
    if (existing && existing.status === "active") {
      return res.status(200).json({ ok: true, already_enrolled: true, ...sanitize(existing) });
    }

    // 1. Create the business application (sandbox auto-approves).
    const p = profile || sandboxProfile(tenant_id);
    const appRes = await unit("/applications", {
      method: "POST",
      body: { data: { type: "businessApplication", attributes: p } },
    });
    const applicationId = appRes.data.id;
    let customerId = appRes.data.relationships?.customer?.data?.id || null;
    let status = appRes.data.attributes?.status;

    // 2. If not approved synchronously, poll a few times (sandbox is instant).
    let tries = 0;
    while (!customerId && tries < 5) {
      tries++;
      const a = await unit(`/applications/${applicationId}`);
      status = a.data.attributes?.status;
      customerId = a.data.relationships?.customer?.data?.id || null;
      if (status === "Denied") throw new Error("Application denied by Unit/partner bank");
    }
    if (!customerId) throw new Error(`Application not approved (status: ${status || "Pending"})`);

    // 3. Create the three envelope deposit accounts.
    const accounts = [];
    for (const env of ENVELOPES) {
      const acc = await unit("/accounts", {
        method: "POST",
        body: {
          data: {
            type: "depositAccount",
            attributes: {
              depositProduct: env.deposit_product,
              tags: { tenant_id, purpose: env.purpose },
              idempotencyKey: `${tenant_id}-${env.purpose}`,
            },
            relationships: { customer: { data: { type: "customer", id: customerId } } },
          },
        },
      });
      const at = acc.data.attributes || {};
      const acctNum = at.accountNumber || "";
      accounts.push({
        account_id: acc.data.id,
        purpose: env.purpose,
        name: env.name,
        deposit_product: env.deposit_product,
        routing: at.routingNumber || null,
        account_number_masked: acctNum ? "••" + acctNum.slice(-4) : null,
      });
    }

    // 4. Issue a virtual debit card on the operating account.
    const operating = accounts.find(a => a.purpose === "operating");
    let cardId = null, cardLast4 = null;
    try {
      const card = await unit("/cards", {
        method: "POST",
        body: {
          data: {
            type: "businessVirtualDebitCard",
            attributes: { idempotencyKey: `${tenant_id}-card` },
            relationships: {
              account: { data: { type: "depositAccount", id: operating.account_id } },
              customer: { data: { type: "customer", id: customerId } },
            },
          },
        },
      });
      cardId = card.data.id;
      cardLast4 = card.data.attributes?.last4Digits || null;
    } catch (e) {
      // Card is non-blocking: the account is open even if card issuance lags.
      console.error("unit-onboard card:", e.message);
    }

    // 5. Persist.
    const now = new Date().toISOString();
    const row = {
      tenant_id,
      application_id: applicationId,
      unit_customer_id: customerId,
      status: "active",
      accounts,
      card_id: cardId,
      card_last4: cardLast4,
      last_error: null,
      updated_at: now,
    };
    const { data: saved, error: upErr } = await supabase
      .from("r7_ledger_unit_accounts")
      .upsert(row, { onConflict: "tenant_id" })
      .select().single();
    if (upErr) return res.status(500).json({ error: "store unit enrollment: " + upErr.message });

    return res.status(200).json({ ok: true, ...sanitize(saved) });
  } catch (err) {
    console.error("unit-onboard unhandled:", err);
    // Record the failure so the screen can show why and offer retry.
    await supabase.from("r7_ledger_unit_accounts")
      .upsert({ tenant_id, status: "error", last_error: err.message, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    return res.status(500).json({ error: err.message });
  }
}

// Never leak the application id or internal columns to the browser.
function sanitize(row) {
  return {
    status: row.status,
    accounts: (row.accounts || []).map(a => ({
      account_id: a.account_id, purpose: a.purpose, name: a.name,
      routing: a.routing, account_number_masked: a.account_number_masked,
    })),
    card_id: row.card_id,
    card_last4: row.card_last4,
  };
}
