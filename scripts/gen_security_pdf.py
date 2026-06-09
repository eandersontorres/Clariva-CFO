# Generates SECURITY.pdf from the information security policy for Plaid upload.
# One-off helper; run: python scripts/gen_security_pdf.py
from fpdf import FPDF

GOLD = (201, 168, 76)
DARK = (20, 20, 20)
GREY = (90, 90, 90)


class PDF(FPDF):
    def header(self):
        if self.page_no() != 1:
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*GREY)
            self.cell(0, 6, "Clariva CFO - Information Security Policy", align="L")
            self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GREY)
        self.cell(0, 10, f"Page {self.page_no()}  -  Confidential", align="C")


def h1(pdf, text):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(0, 9, text, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def h2(pdf, text):
    pdf.ln(2)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.5)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.l_margin + 30, y)
    pdf.ln(2)


def body(pdf, text):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(40, 40, 40)
    pdf.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def bullet(pdf, text):
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(40, 40, 40)
    pdf.set_x(pdf.l_margin)
    pdf.cell(5, 5.5, "-")
    pdf.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")


def meta(pdf, text):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*GREY)
    pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")


pdf = PDF()
pdf.set_auto_page_break(auto=True, margin=18)
pdf.add_page()

h1(pdf, "Clariva CFO - Information Security Policy")
meta(pdf,
     "Owner: Anderson Torres (Owner / Security Lead)\n"
     "Contact: eanderson.torres@gmail.com\n"
     "Effective date: 2026-06-09\n"
     "Review cadence: Reviewed at least annually and on any material architecture change.")
pdf.ln(2)

h2(pdf, "1. Purpose & Scope")
body(pdf,
     "This policy documents the security controls Clariva CFO operationalizes to identify, "
     "mitigate, and monitor information-security risks. It covers the Clariva CFO web application, "
     "its serverless API, its database, and all third-party integrations (Plaid, Anthropic, "
     "Supabase, Vercel, Square). Clariva CFO is a bookkeeping and financial-intelligence platform "
     "for restaurant operators that ingests bank transactions (via Plaid) and POS data to produce "
     "ledgers, P&L, cash-flow, and tax-ready reports.")

h2(pdf, "2. Data Classification")
bullet(pdf, "Secret (Plaid access tokens, API keys, service-role keys): server-side only, never sent to the browser.")
bullet(pdf, "Sensitive (bank transactions, balances, ledger data): encrypted in transit and at rest, access scoped per tenant.")
bullet(pdf, "Public (marketing pages, app shell): no restrictions.")
body(pdf,
     "Clariva CFO does NOT store full card numbers (PAN), online-banking credentials, or government "
     "IDs. Bank authentication happens entirely inside Plaid's interface.")

h2(pdf, "3. Secrets Management")
bullet(pdf, "All credentials (PLAID_SECRET, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY) are stored as server-side environment variables in Vercel and are never exposed to the browser. Client-exposed variables use the VITE_ prefix and carry only non-secret values.")
bullet(pdf, "Plaid access tokens are written to a dedicated table (r7_ledger_plaid_items) protected by Row Level Security that denies the anon and authenticated roles entirely. Only the service_role key, used exclusively inside the /api/* serverless functions, can read them. The browser never receives a bank access token.")
bullet(pdf, "Third-party APIs requiring a secret (Anthropic) are called only through a server-side proxy, never directly from the client.")

h2(pdf, "4. Access Control")
bullet(pdf, "The browser connects to the database with a least-privilege anon key, and every ledger table enforces Row Level Security scoped by tenant_id.")
bullet(pdf, "Elevated database access (the service_role key, which bypasses RLS) is used only in serverless functions, never shipped to the client.")
bullet(pdf, "Plaid beneficial-owner / dashboard access is limited to the company's authorized control person.")

h2(pdf, "5. Encryption")
bullet(pdf, "In transit: all traffic is served over HTTPS/TLS (enforced by Vercel). Global security headers are set: X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin.")
bullet(pdf, "At rest: data is stored in Supabase (managed PostgreSQL) and Vercel, both of which encrypt data at rest by default.")

h2(pdf, "6. Vendor / Third-Party Risk")
body(pdf,
     "Clariva CFO relies on SOC 2-compliant infrastructure providers: Supabase (database/auth), "
     "Vercel (hosting/compute), Plaid (bank connectivity), Anthropic (AI parsing), and Square (POS). "
     "Secrets for each provider are isolated and rotated if exposure is suspected.")

h2(pdf, "7. Monitoring & Logging")
bullet(pdf, "Serverless function errors are logged (Vercel runtime logs) and surfaced for review.")
bullet(pdf, "Plaid item errors are persisted (status, last_error) and shown to the operator so failed connections are visible rather than silent.")

h2(pdf, "8. Incident Response")
body(pdf,
     "On suspected compromise, the security lead will: (1) rotate the affected credentials (Vercel "
     "env vars and/or Supabase keys), (2) revoke affected Plaid items via the Plaid dashboard, "
     "(3) assess scope using logs, and (4) notify affected parties as required. The security "
     "contact above is the escalation point.")

h2(pdf, "9. Data Retention & Deletion")
bullet(pdf, "Plaid access tokens are retained only while the bank connection is active. When an item is disconnected or compromise is suspected, the token is revoked via the Plaid dashboard and the row is removed from r7_ledger_plaid_items.")
bullet(pdf, "Transaction and ledger data is retained while the account is active and for as long as required to support bookkeeping and tax reporting (financial records are generally retained for up to seven years, consistent with IRS guidance).")
bullet(pdf, "On account closure or a verified deletion request, the operator can delete the tenant's ledger data from Supabase and revoke all associated Plaid items, after which the data is no longer retained.")
bullet(pdf, "This retention and deletion practice is reviewed at least annually together with this policy.")

h2(pdf, "10. Change Management & Review")
body(pdf,
     "Code changes are version-controlled in Git and deployed via Vercel. This policy is reviewed "
     "at least annually and whenever the architecture materially changes (e.g., adding a new data "
     "source or third-party integration).")

pdf.output("SECURITY.pdf")
print("wrote SECURITY.pdf")
